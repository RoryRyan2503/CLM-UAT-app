import { config } from "dotenv";
import { mkdir, writeFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { Pool, type PoolClient, type QueryResultRow } from "pg";

config({ path: resolve(process.cwd(), ".env.migration") });
config({ path: resolve(process.cwd(), ".env.local") });

const TABLES = [
  { name: "vendors", columns: ["id", "slug", "name", "created_at"] },
  { name: "personas", columns: ["id", "name", "created_at"] },
  { name: "testers", columns: ["id", "name", "email", "department", "persona", "persona_id", "access_code_hash", "access_code_lookup", "is_active", "created_at", "updated_at"] },
  { name: "test_cases", columns: ["id", "test_case_id", "functional_area", "persona", "scenario", "suggested_steps", "expected_result", "required_evidence", "source_row_number", "created_at", "updated_at"] },
  { name: "persona_test_cases", columns: ["persona_id", "test_case_id", "created_at"] },
  { name: "assignments", columns: ["id", "tester_id", "test_case_id", "vendor_id", "is_active", "created_at"] },
  { name: "test_results", columns: ["id", "assignment_id", "actual_result", "feature_adequate", "improvement_needed", "improvement_description", "feature_user_friendly", "status", "grade", "severity", "workaround_notes", "usability_rating", "configuration_required", "vendor_assistance_required", "blocked_reason", "blocked_owner", "blocked_target_date", "started_at", "completed_at", "version", "updated_by_tester_id", "created_at", "updated_at"] },
  { name: "defects", columns: ["id", "defect_code", "test_result_id", "vendor_id", "title", "description", "severity", "status", "retest_assignment_id", "created_by_tester_id", "created_at", "updated_at"] },
  { name: "comparisons", columns: ["id", "tester_id", "test_case_id", "preferred_vendor", "comments", "version", "created_at", "updated_at"] },
  { name: "evidence", columns: ["id", "test_result_id", "kind", "storage_path", "file_name", "mime_type", "size_bytes", "url", "created_at", "created_by_tester_id"] },
  { name: "result_history", columns: ["id", "test_result_id", "changed_by_tester_id", "changed_by_admin", "change_type", "previous_values", "new_values", "version", "created_at"] },
  { name: "import_batches", columns: ["id", "file_name", "row_count", "created_count", "updated_count", "error_count", "created_at"] },
] as const;

const MAX_EVIDENCE_BYTES = 10 * 1024 * 1024;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured in the protected migration environment.`);
  return value;
}

function quoteColumn(column: string): string {
  if (!/^[a-z_][a-z0-9_]*$/.test(column)) throw new Error("Invalid migration column name.");
  return `"${column}"`;
}

function safeDestination(root: string, storagePath: string): string {
  if (isAbsolute(storagePath) || storagePath.includes("\\")) throw new Error("Unsafe legacy evidence path.");
  const target = resolve(root, storagePath);
  const relativePath = relative(root, target);
  if (!relativePath || relativePath.startsWith("..") || isAbsolute(relativePath)) {
    throw new Error("Unsafe legacy evidence path.");
  }
  return target;
}

async function assertEmptyTarget(target: Pool): Promise<void> {
  for (const { name } of TABLES) {
    const { rows } = await target.query<{ count: string }>(`select count(*)::text as count from public.${name}`);
    if (Number(rows[0].count) !== 0) throw new Error(`Target table public.${name} is not empty; use a new staging database.`);
  }
  for (const name of ["admin_users", "admin_sessions", "tester_sessions", "login_attempts"]) {
    const { rows } = await target.query<{ count: string }>(`select count(*)::text as count from public.${name}`);
    if (Number(rows[0].count) !== 0) throw new Error(`Target table public.${name} is not empty; use a new staging database.`);
  }
}

async function copyRows(
  source: Pool,
  target: Pool | PoolClient,
  table: (typeof TABLES)[number],
): Promise<QueryResultRow[]> {
  const { rows } = await source.query(`select * from public.${table.name}`);
  for (const row of rows) {
    const columns: string[] = table.columns.filter((column) => column in row);
    const values = columns.map((column) => row[column]);
    if (table.name === "test_results") {
      columns.push("defect_id");
      values.push(null);
    }
    const placeholders = columns.map((_, index) => `$${index + 1}`).join(", ");
    await target.query(
      `insert into public.${table.name} (${columns.map(quoteColumn).join(", ")}) values (${placeholders})`,
      values,
    );
  }
  return rows;
}

async function copyEvidenceFiles(sourceUrl: string, serviceKey: string, root: string, evidenceRows: QueryResultRow[]) {
  const copiedPaths = new Set<string>();
  for (const evidence of evidenceRows) {
    if (evidence.kind !== "file" || typeof evidence.storage_path !== "string") continue;
    if (copiedPaths.has(evidence.storage_path)) continue;
    copiedPaths.add(evidence.storage_path);
    const destination = safeDestination(root, evidence.storage_path);
    const objectPath = evidence.storage_path.split("/").map(encodeURIComponent).join("/");
    const response = await fetch(`${sourceUrl}/storage/v1/object/authenticated/evidence/${objectPath}`, {
      headers: { apikey: serviceKey, authorization: `Bearer ${serviceKey}` },
      signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok) throw new Error(`Evidence download failed with HTTP ${response.status}.`);
    const contentLength = Number(response.headers.get("content-length"));
    if (!Number.isFinite(contentLength) || contentLength <= 0 || contentLength > MAX_EVIDENCE_BYTES) {
      throw new Error(`Evidence ${evidence.id} is empty, larger than 10 MB, or has no valid Content-Length.`);
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length !== contentLength || bytes.length > MAX_EVIDENCE_BYTES) {
      throw new Error(`Evidence ${evidence.id} size did not match its response header.`);
    }
    await mkdir(resolve(destination, ".."), { recursive: true });
    await writeFile(destination, bytes, { flag: "wx", mode: 0o600 });
  }
}

async function main() {
  const sourceDatabaseUrl = requireEnv("SOURCE_DATABASE_URL");
  const sourceUrl = requireEnv("SOURCE_SUPABASE_URL").replace(/\/$/, "");
  const sourceServiceKey = requireEnv("SOURCE_SUPABASE_SERVICE_KEY");
  const targetUrl = requireEnv("MIGRATION_DATABASE_URL");
  const evidenceRootSetting = requireEnv("EVIDENCE_STORAGE_DIR");
  if (!isAbsolute(evidenceRootSetting)) throw new Error("EVIDENCE_STORAGE_DIR must be an absolute path.");
  const evidenceRoot = resolve(evidenceRootSetting);
  if (!relative(resolve(process.cwd()), evidenceRoot).startsWith("..")) {
    throw new Error("EVIDENCE_STORAGE_DIR must be outside the application directory.");
  }

  const source = new Pool({ connectionString: sourceDatabaseUrl, max: 1, connectionTimeoutMillis: 10_000 });
  const target = new Pool({ connectionString: targetUrl, max: 1, connectionTimeoutMillis: 10_000 });
  const client = await target.connect();
  try {
    await assertEmptyTarget(target);
    console.log("Copying hosted evidence files...");
    const { rows: evidenceRows } = await source.query("select * from public.evidence order by id");
    await copyEvidenceFiles(sourceUrl, sourceServiceKey, evidenceRoot, evidenceRows);
    const { rows: settingsRows } = await source.query("select id, evidence_enabled, updated_at from public.app_settings");

    await client.query("begin");
    try {
      const importedResults: QueryResultRow[] = [];
      for (const table of TABLES) {
        console.log(`Importing ${table.name}...`);
        const rows = await copyRows(source, client, table);
        if (table.name === "test_results") importedResults.push(...rows);
      }
      for (const result of importedResults) {
        if (result.defect_id) {
          await client.query("update test_results set defect_id = $1 where id = $2", [result.defect_id, result.id]);
        }
      }
      for (const setting of settingsRows) {
        await client.query(
          `insert into app_settings (id, evidence_enabled, evidence_mode, updated_at) values ($1, $2, $3, $4)
           on conflict (id) do update set evidence_enabled = excluded.evidence_enabled,
             evidence_mode = excluded.evidence_mode, updated_at = excluded.updated_at`,
          [setting.id, setting.evidence_enabled, setting.evidence_enabled ? "upload" : "disabled", setting.updated_at],
        );
      }
      await client.query(
        `select setval('defect_code_seq', coalesce(max(substring(defect_code from 5)::bigint), 0) + 1, false)
         from defects`,
      );
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
    console.log("Hosted data copied. Recreate local admin accounts; old sessions were intentionally not migrated.");
    console.log("Verify database row counts and download sample evidence before cutover.");
  } finally {
    client.release();
    await Promise.all([source.end(), target.end()]);
  }
}

main().catch((error: unknown) => {
  console.error("Hosted data import failed.", error instanceof Error ? error.message : "Unknown error.");
  process.exitCode = 1;
});