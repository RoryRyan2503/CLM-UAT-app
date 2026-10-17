import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { extname, isAbsolute, relative, resolve } from "node:path";
import { query } from "@/lib/db/pool";
import { AppError } from "@/lib/actionResult";
import { getEvidenceEnabled } from "@/lib/data/appSettings";
import type { Database } from "@/lib/types/database";

const MAX_EVIDENCE_BYTES = 10 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set([".pdf", ".png", ".jpg", ".jpeg", ".txt", ".csv", ".xls", ".xlsx", ".doc", ".docx"]);
const EVIDENCE_ROOT = process.env.EVIDENCE_STORAGE_DIR;

function getEvidenceRoot(): string {
  if (EVIDENCE_ROOT) {
    if (!isAbsolute(EVIDENCE_ROOT)) throw new Error("EVIDENCE_STORAGE_DIR must be an absolute path.");
    const root = resolve(EVIDENCE_ROOT);
    const relativeToApp = relative(resolve(/* turbopackIgnore: true */ process.cwd()), root);
    if (!relativeToApp.startsWith("..")) {
      throw new Error("EVIDENCE_STORAGE_DIR must be outside the application directory.");
    }
    return root;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("EVIDENCE_STORAGE_DIR must point to a private directory outside the application folder.");
  }
  return resolve(process.cwd(), ".private-evidence");
}

function resolveEvidencePath(storagePath: string): string {
  const root = getEvidenceRoot();
  const filePath = resolve(root, storagePath);
  const pathFromRoot = relative(root, filePath);
  if (!pathFromRoot || pathFromRoot.startsWith("..") || isAbsolute(pathFromRoot)) {
    throw new AppError("NOT_FOUND", "Evidence file not found.");
  }
  return filePath;
}

async function assertEvidenceCollectionEnabled() {
  if (!(await getEvidenceEnabled())) {
    throw new AppError("FORBIDDEN", "Evidence collection is disabled by an administrator.");
  }
}

async function assertTesterOwnsResult(testerId: string, testResultId: string) {
  const { rows } = await query<{ id: string; tester_id: string; is_active: boolean }>(
    `select tr.id, a.tester_id, a.is_active from test_results tr
     join assignments a on a.id = tr.assignment_id where tr.id = $1`,
    [testResultId],
  );
  const assignment = rows[0];
  if (!assignment || assignment.tester_id !== testerId || !assignment.is_active) {
    throw new AppError("FORBIDDEN", "You may only attach evidence to your own results.");
  }
  return assignment.id;
}

export async function uploadEvidenceFile(testerId: string, testResultId: string, file: File) {
  const canonicalResultId = await assertTesterOwnsResult(testerId, testResultId);
  await assertEvidenceCollectionEnabled();
  const fileName = file.name.split(/[\\/]/).pop()?.trim() ?? "";
  const extension = extname(fileName).toLowerCase();
  if (!fileName || fileName.length > 255 || /[\u0000-\u001f]/.test(fileName) || !ALLOWED_EXTENSIONS.has(extension)) {
    throw new AppError("VALIDATION", "Choose a supported evidence file type.");
  }
  if (file.size <= 0 || file.size > MAX_EVIDENCE_BYTES) {
    throw new AppError("VALIDATION", "Evidence files must be between 1 byte and 10 MB.");
  }

  const storagePath = `${canonicalResultId}/${randomUUID()}${extension}`;
  const filePath = resolveEvidencePath(storagePath);
  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.length !== file.size) throw new AppError("VALIDATION", "Uploaded file size is invalid.");
  await mkdir(resolve(filePath, ".."), { recursive: true });
  await writeFile(filePath, buffer, { flag: "wx", mode: 0o600 });
  try {
    const mimeType = file.type && /^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i.test(file.type)
      ? file.type
      : "application/octet-stream";
    const { rows } = await query<Database["public"]["Tables"]["evidence"]["Row"]>(
      `insert into evidence
         (test_result_id, kind, storage_path, file_name, mime_type, size_bytes, created_by_tester_id)
       values ($1, 'file', $2, $3, $4, $5, $6) returning *`,
      [canonicalResultId, storagePath, fileName, mimeType, file.size, testerId],
    );
    return rows[0];
  } catch {
    await rm(filePath, { force: true });
    throw new AppError("VALIDATION", "Unable to save evidence record.");
  }
}

export async function registerEvidenceUrl(testerId: string, testResultId: string, url: string) {
  await assertTesterOwnsResult(testerId, testResultId);
  await assertEvidenceCollectionEnabled();
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new AppError("VALIDATION", "Enter a valid HTTP or HTTPS link.");
  }
  if (!["https:", "http:"].includes(parsed.protocol) || url.length > 2048) {
    throw new AppError("VALIDATION", "Enter a valid HTTP or HTTPS link.");
  }
  const { rows } = await query<Database["public"]["Tables"]["evidence"]["Row"]>(
    `insert into evidence (test_result_id, kind, url, created_by_tester_id)
     values ($1, 'url', $2, $3) returning *`,
    [testResultId, parsed.toString(), testerId],
  );
  if (!rows[0]) throw new AppError("VALIDATION", "Unable to save evidence link.");
  return rows[0];
}

export async function getEvidenceFile(evidenceId: string, opts: { testerId?: string; isAdmin?: boolean }) {
  const { rows } = await query<{
    storage_path: string | null; file_name: string | null; mime_type: string | null;
    tester_id: string; is_active: boolean;
  }>(
    `select e.storage_path, e.file_name, e.mime_type, a.tester_id, a.is_active
     from evidence e join test_results tr on tr.id = e.test_result_id
     join assignments a on a.id = tr.assignment_id
     where e.id = $1 and e.kind = 'file'`,
    [evidenceId],
  );
  const evidence = rows[0];
  if (!evidence?.storage_path) throw new AppError("NOT_FOUND", "Evidence file not found.");
  if (!opts.isAdmin && (evidence.tester_id !== opts.testerId || !evidence.is_active)) {
    throw new AppError("FORBIDDEN", "You do not have access to this evidence file.");
  }
  const filePath = resolveEvidencePath(evidence.storage_path);
  const contentType = evidence.mime_type && /^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i.test(evidence.mime_type)
    ? evidence.mime_type
    : "application/octet-stream";
  return { filePath, fileName: evidence.file_name ?? "evidence", contentType };
}
