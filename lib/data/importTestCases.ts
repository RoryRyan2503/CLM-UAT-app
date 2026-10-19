import "server-only";
import { withTransaction } from "@/lib/db/pool";
import type { ImportedTestCaseRow } from "@/lib/validation/import";

export interface ImportCommitResult {
  createdCount: number;
  updatedCount: number;
  archivedCount: number;
}

/** Idempotent by stable test_case_id: inserts new definitions, updates existing ones in place. */
export async function commitTestCaseImport(
  rows: ImportedTestCaseRow[],
  fileName: string,
  importedByAdminId: string | null,
  fullCatalog = false,
): Promise<ImportCommitResult> {
  if (fullCatalog && rows.length === 0) throw new Error("A full catalog import must contain at least one valid test case.");
  let createdCount = 0;
  let updatedCount = 0;
  let archivedCount = 0;
  await withTransaction(async (client) => {
    const importedIds: string[] = [];
    for (const row of rows) {
      const { rows: result } = await client.query<{ id: string; inserted: boolean }>(
        `insert into test_cases
           (test_case_id, functional_area, persona, scenario, use_case, suggested_steps,
            sirion_steps, sirion_feature, sirion_availability, ironclad_steps, ironclad_feature,
            ironclad_availability, expected_result, required_evidence, source_row_number, is_active)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, coalesce($14, ''), $15, true)
         on conflict (test_case_id) do update set
           functional_area = excluded.functional_area,
           persona = excluded.persona,
           scenario = excluded.scenario,
           use_case = case when $16 then excluded.use_case else test_cases.use_case end,
           suggested_steps = excluded.suggested_steps,
           sirion_steps = case when $16 then excluded.sirion_steps else test_cases.sirion_steps end,
           sirion_feature = case when $16 then excluded.sirion_feature else test_cases.sirion_feature end,
           sirion_availability = case when $16 then excluded.sirion_availability else test_cases.sirion_availability end,
           ironclad_steps = case when $16 then excluded.ironclad_steps else test_cases.ironclad_steps end,
           ironclad_feature = case when $16 then excluded.ironclad_feature else test_cases.ironclad_feature end,
           ironclad_availability = case when $16 then excluded.ironclad_availability else test_cases.ironclad_availability end,
           expected_result = excluded.expected_result,
           required_evidence = case when $14 is null then test_cases.required_evidence else excluded.required_evidence end,
           source_row_number = excluded.source_row_number,
           is_active = case when $16 then true else test_cases.is_active end,
           updated_at = now()
         returning id, (xmax = 0) as inserted`,
        [row.testCaseId, row.functionalArea, row.persona || null, row.scenario, row.useCase || row.scenario,
          row.suggestedSteps || row.sirionSteps || row.ironcladSteps,
          row.sirionSteps || row.suggestedSteps, row.sirionFeature, row.sirionAvailability,
          row.ironcladSteps || row.suggestedSteps, row.ironcladFeature, row.ironcladAvailability,
          row.expectedResult, row.requiredEvidence ?? null, row.sourceRowNumber, fullCatalog],
      );
      if (result[0]?.inserted) createdCount += 1;
      else updatedCount += 1;

      const testCaseUuid = result[0]?.id;
      if (testCaseUuid) {
        importedIds.push(testCaseUuid);
        if (fullCatalog) {
          await client.query("delete from persona_test_cases where test_case_id = $1", [testCaseUuid]);
        }
        const personaNames = [...new Set(row.persona.split(/[;\n]/).map((name) => name.trim().replace(/\s+/g, " ")).filter(Boolean))];
        for (const personaName of personaNames) {
          const { rows: personas } = await client.query<{ id: string }>(
            `insert into personas (name) values ($1)
             on conflict (name) do update set name = excluded.name returning id`,
            [personaName],
          );
          const personaId = personas[0]?.id;
          if (personaId) {
            await client.query(
              "insert into persona_test_cases (persona_id, test_case_id) values ($1, $2) on conflict do nothing",
              [personaId, testCaseUuid],
            );
          }
        }
      }
    }

    if (fullCatalog) {
      const { rowCount } = await client.query(
        `update test_cases set is_active = false, updated_at = now()
         where is_active and not (id = any($1::uuid[]))`,
        [importedIds],
      );
      archivedCount = rowCount ?? 0;
      await client.query(
        `delete from persona_test_cases ptc
         using test_cases tc
         where ptc.test_case_id = tc.id and not tc.is_active`,
      );
    }

    await client.query(
      `insert into import_batches
         (file_name, imported_by, row_count, created_count, updated_count, error_count)
       values ($1, $2, $3, $4, $5, 0)`,
      [fileName, importedByAdminId, rows.length, createdCount, updatedCount],
    );
  });

  return { createdCount, updatedCount, archivedCount };
}
