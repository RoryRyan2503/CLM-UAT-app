import "server-only";
import { withTransaction } from "@/lib/db/pool";
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
  let createdCount = 0;
  let updatedCount = 0;
  await withTransaction(async (client) => {
    for (const row of rows) {
      const { rows: result } = await client.query<{ inserted: boolean }>(
        `insert into test_cases
           (test_case_id, functional_area, persona, scenario, suggested_steps, expected_result, required_evidence, source_row_number)
         values ($1, $2, $3, $4, $5, $6, $7, $8)
         on conflict (test_case_id) do update set
           functional_area = excluded.functional_area,
           persona = excluded.persona,
           scenario = excluded.scenario,
           suggested_steps = excluded.suggested_steps,
           expected_result = excluded.expected_result,
           required_evidence = excluded.required_evidence,
           source_row_number = excluded.source_row_number,
           updated_at = now()
         returning (xmax = 0) as inserted`,
        [row.testCaseId, row.functionalArea, row.persona || null, row.scenario, row.suggestedSteps,
          row.expectedResult, row.requiredEvidence, row.sourceRowNumber],
      );
      if (result[0]?.inserted) createdCount += 1;
      else updatedCount += 1;
    }

    await client.query(
      `insert into import_batches
         (file_name, imported_by, row_count, created_count, updated_count, error_count)
       values ($1, $2, $3, $4, $5, 0)`,
      [fileName, importedByAdminId, rows.length, createdCount, updatedCount],
    );
  });

  return { createdCount, updatedCount };
}
