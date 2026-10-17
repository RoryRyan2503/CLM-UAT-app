import { config } from "dotenv";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Pool } from "pg";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env.production") });
import { parseTestCaseWorkbook } from "../lib/import/parseWorkbook";

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("Set DATABASE_URL in .env.local or .env.production before seeding.");

  const filePath = resolve(process.cwd(), process.argv[2] ?? "Honeywell_CLM_UAT_Tester_Draft.xlsx");
  if (!existsSync(filePath)) {
    throw new Error(`Workbook not found: ${filePath}`);
  }

  const pool = new Pool({ connectionString: databaseUrl, max: 1, connectionTimeoutMillis: 5_000 });

  try {
    console.log("Seeding vendors...");
    await pool.query(
      `insert into vendors (slug, name) values ('ironclad', 'Ironclad'), ('sirion', 'Sirion')
       on conflict (slug) do update set name = excluded.name`,
    );

    console.log(`Parsing workbook: ${filePath}`);
    const preview = parseTestCaseWorkbook(readFileSync(filePath), filePath);
    console.log(`Sheets found: ${preview.sheetNames.join(", ")}`);
    console.log(`Using sheet: ${preview.usedSheetName}`);
    console.log(`Valid rows: ${preview.validRows.length}`);
    if (preview.rowErrors.length > 0) console.warn(`Row errors (skipped): ${preview.rowErrors.length}`);
    if (preview.duplicateTestCaseIds.length > 0) {
      console.warn(`Duplicate Test Case IDs (kept first occurrence only): ${preview.duplicateTestCaseIds.join(", ")}`);
    }

    let created = 0;
    let updated = 0;
    await pool.query("begin");
    try {
      for (const row of preview.validRows) {
        const { rows } = await pool.query<{ inserted: boolean }>(
          `insert into test_cases
             (test_case_id, functional_area, persona, scenario, suggested_steps, expected_result, required_evidence, source_row_number)
           values ($1, $2, $3, $4, $5, $6, $7, $8)
           on conflict (test_case_id) do update set
             functional_area = excluded.functional_area, persona = excluded.persona,
             scenario = excluded.scenario, suggested_steps = excluded.suggested_steps,
             expected_result = excluded.expected_result, required_evidence = excluded.required_evidence,
             source_row_number = excluded.source_row_number, updated_at = now()
           returning (xmax = 0) as inserted`,
          [row.testCaseId, row.functionalArea, row.persona || null, row.scenario, row.suggestedSteps,
            row.expectedResult, row.requiredEvidence, row.sourceRowNumber],
        );
        if (rows[0]?.inserted) created += 1;
        else updated += 1;
      }
      await pool.query("commit");
    } catch (error) {
      await pool.query("rollback");
      throw error;
    }
    console.log(`Done. Created ${created}, updated ${updated} test case definitions.`);
    console.log("Next: sign in as an admin and use Admin > Assignments > Generate assignments once testers exist.");
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("Database seed failed.", error instanceof Error ? error.message : "Unknown error.");
  process.exitCode = 1;
});
