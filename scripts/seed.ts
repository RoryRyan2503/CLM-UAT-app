/**
 * Imports test case definitions from the source workbook into Supabase.
 * Usage: npm run db:seed -- path/to/workbook.xlsx
 * Defaults to ./Honeywell_CLM_UAT_Tester_Draft.xlsx in the project root.
 */
import { config } from "dotenv";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

config({ path: resolve(process.cwd(), ".env.local") });

import { createClient } from "@supabase/supabase-js";
import { parseTestCaseWorkbook } from "../lib/import/parseWorkbook";

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local before seeding.");
  }

  const filePath = resolve(process.cwd(), process.argv[2] ?? "Honeywell_CLM_UAT_Tester_Draft.xlsx");
  if (!existsSync(filePath)) {
    throw new Error(`Workbook not found: ${filePath}`);
  }

  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

  console.log("Seeding vendors…");
  const { error: vendorError } = await supabase
    .from("vendors")
    .upsert(
      [
        { slug: "ironclad", name: "Ironclad" },
        { slug: "sirion", name: "Sirion" },
      ],
      { onConflict: "slug" },
    );
  if (vendorError) throw vendorError;

  console.log(`Parsing workbook: ${filePath}`);
  const buffer = readFileSync(filePath);
  const preview = parseTestCaseWorkbook(buffer, filePath);

  console.log(`Sheets found: ${preview.sheetNames.join(", ")}`);
  console.log(`Using sheet: ${preview.usedSheetName}`);
  console.log(`Valid rows: ${preview.validRows.length}`);
  if (preview.rowErrors.length > 0) {
    console.warn(`Row errors (skipped): ${preview.rowErrors.length}`);
    for (const e of preview.rowErrors) console.warn(`  Row ${e.rowNumber}: ${e.message}`);
  }
  if (preview.duplicateTestCaseIds.length > 0) {
    console.warn(`Duplicate Test Case IDs (kept first occurrence only): ${preview.duplicateTestCaseIds.join(", ")}`);
  }

  let created = 0;
  let updated = 0;
  for (const row of preview.validRows) {
    const { data: existing } = await supabase
      .from("test_cases")
      .select("id")
      .eq("test_case_id", row.testCaseId)
      .maybeSingle();

    const payload = {
      test_case_id: row.testCaseId,
      functional_area: row.functionalArea,
      persona: row.persona || null,
      scenario: row.scenario,
      suggested_steps: row.suggestedSteps,
      expected_result: row.expectedResult,
      required_evidence: row.requiredEvidence,
      source_row_number: row.sourceRowNumber,
    };

    if (existing) {
      const { error } = await supabase.from("test_cases").update(payload).eq("id", existing.id);
      if (error) throw error;
      updated += 1;
    } else {
      const { error } = await supabase.from("test_cases").insert(payload);
      if (error) throw error;
      created += 1;
    }
  }

  console.log(`Done. Created ${created}, updated ${updated} test case definitions.`);
  console.log("Next: sign in as an admin and use Admin → Assignments → \"Generate assignments\" once testers exist.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
