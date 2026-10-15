import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/adminClient";
import { AppError } from "@/lib/actionResult";
import type { ImportedTestCaseRow } from "@/lib/validation/import";

export interface ImportCommitResult {
  createdCount: number;
  updatedCount: number;
}

/** Idempotent by stable test_case_id: inserts new definitions, updates existing ones in place. */
export async function commitTestCaseImport(
  rows: ImportedTestCaseRow[],
  fileName: string,
  importedByAdminId: string | null,
): Promise<ImportCommitResult> {
  const supabase = createSupabaseAdminClient();
  let createdCount = 0;
  let updatedCount = 0;

  for (const row of rows) {
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
      if (error) throw new AppError("VALIDATION", `Failed to update ${row.testCaseId}.`);
      updatedCount += 1;
    } else {
      const { error } = await supabase.from("test_cases").insert(payload);
      if (error) throw new AppError("VALIDATION", `Failed to import ${row.testCaseId}.`);
      createdCount += 1;
    }
  }

  await supabase.from("import_batches").insert({
    file_name: fileName,
    imported_by: importedByAdminId,
    row_count: rows.length,
    created_count: createdCount,
    updated_count: updatedCount,
    error_count: 0,
  });

  return { createdCount, updatedCount };
}
