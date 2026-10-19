import "server-only";
import { query, withTransaction } from "@/lib/db/pool";
import { AppError } from "@/lib/actionResult";
import type { Database } from "@/lib/types/database";
import type { DefectInput } from "@/lib/validation/defect";

type DefectRow = Database["public"]["Tables"]["defects"]["Row"];
type TestResultRow = Database["public"]["Tables"]["test_results"]["Row"];
type DefectFlatRow = DefectRow & {
  vendor_name: string;
  tester_name: string;
  test_case_id: string;
};

export async function createDefect(
  testerId: string,
  input: DefectInput,
) {
  return withTransaction(async (client) => {
    const { rows: results } = await client.query<{
      id: string; version: number; defect_id: string | null; vendor_id: string; tester_id: string; is_active: boolean;
    }>(
      `select tr.id, tr.version, tr.defect_id, a.vendor_id, a.tester_id, a.is_active
       from test_results tr join assignments a on a.id = tr.assignment_id
       where tr.id = $1 and a.tester_id = $2 and a.is_active = true for update of tr`,
      [input.testResultId, testerId],
    );
    const result = results[0];
    if (!result || !result.is_active) throw new AppError("FORBIDDEN", "You may only log defects for your own active results.");
    if (result.vendor_id !== input.vendorId) throw new AppError("FORBIDDEN", "The defect tool does not match this assignment.");
    if (result.defect_id) throw new AppError("CONFLICT", "A defect is already linked. Edit the existing defect instead.");
    const { rows: codes } = await client.query<{ defect_code: string }>(
      "select 'DEF-' || lpad(nextval('defect_code_seq')::text, 4, '0') as defect_code",
    );
    const { rows } = await client.query(
      `insert into defects
         (defect_code, test_result_id, vendor_id, title, description, severity, created_by_tester_id)
       values ($1, $2, $3, $4, $5, $6, $7) returning *`,
      [codes[0].defect_code, input.testResultId, input.vendorId, input.title,
        input.description || null, input.severity || null, testerId],
    );
    const defect = rows[0] as DefectRow;
    const { rows: updatedRows } = await client.query<TestResultRow>(
      `update test_results set defect_id = $1, version = version + 1,
         updated_by_tester_id = $2, updated_at = now()
       where id = $3 returning *`,
      [defect.id, testerId, result.id],
    );
    const updated = updatedRows[0];
    if (!updated) throw new AppError("CONFLICT", "Unable to link the defect to the evaluation.");
    await client.query(
      `insert into result_history
         (test_result_id, changed_by_tester_id, changed_by_admin, change_type, previous_values, new_values, version)
       values ($1, $2, false, 'defect_link', $3::jsonb, $4::jsonb, $5)`,
      [result.id, testerId, JSON.stringify({ defect_id: result.defect_id }),
        JSON.stringify({ defect_id: defect.id }), updated.version],
    );
    return { defect, resultVersion: updated.version };
  });
}

export async function updateDefect(testerId: string, input: DefectInput & { defectId: string }) {
  return withTransaction(async (client) => {
    const { rows: matches } = await client.query<{
      defect_id: string | null; vendor_id: string; tester_id: string; is_active: boolean;
      linked_defect_id: string | null; result_id: string; version: number;
      title: string; description: string | null; severity: string | null;
    }>(
      `select d.id as defect_id, tr.defect_id as linked_defect_id, d.vendor_id, a.tester_id, a.is_active,
         tr.id as result_id, tr.version, d.title, d.description, d.severity
       from defects d
       join test_results tr on tr.id = d.test_result_id
       join assignments a on a.id = tr.assignment_id
      where d.id = $1 and tr.id = $2
       for update of d, tr`,
      [input.defectId, input.testResultId],
    );
    const current = matches[0];
    if (!current || current.tester_id !== testerId || !current.is_active) {
      throw new AppError("FORBIDDEN", "You may only edit defects for your own active results.");
    }
    if (current.vendor_id !== input.vendorId) throw new AppError("FORBIDDEN", "The defect tool does not match this assignment.");

    const { rows } = await client.query<DefectRow>(
      `update defects set title = $1, description = $2, severity = $3
       where id = $4 returning *`,
      [input.title, input.description || null, input.severity || null, input.defectId],
    );
    const defect = rows[0];
    if (!defect) throw new AppError("NOT_FOUND", "Defect not found.");

    const { rows: resultRows } = await client.query<TestResultRow>(
      `update test_results set defect_id = $1, version = version + 1, updated_by_tester_id = $2, updated_at = now()
        where id = $3 returning *`,
      [input.defectId, testerId, current.result_id],
    );
    const updatedResult = resultRows[0];
    if (!updatedResult) throw new AppError("CONFLICT", "Unable to update the related evaluation.");
    await client.query(
      `insert into result_history
         (test_result_id, changed_by_tester_id, changed_by_admin, change_type, previous_values, new_values, version)
       values ($1, $2, false, 'defect_update', $3::jsonb, $4::jsonb, $5)`,
      [current.result_id, testerId,
        JSON.stringify({ defect_id: current.linked_defect_id, title: current.title, description: current.description, severity: current.severity }),
        JSON.stringify({ defect_id: defect.id, title: defect.title, description: defect.description, severity: defect.severity }),
        updatedResult.version],
    );
    return { defect, resultVersion: updatedResult.version };
  });
}

export async function listDefects() {
  const { rows } = await query<DefectFlatRow>(
    `select d.*, v.name as vendor_name, tr.assignment_id, t.name as tester_name, tc.test_case_id
     from defects d
     join vendors v on v.id = d.vendor_id
     join test_results tr on tr.id = d.test_result_id
     join assignments a on a.id = tr.assignment_id
     join testers t on t.id = a.tester_id
     join test_cases tc on tc.id = a.test_case_id
     order by d.created_at desc`,
  );
  return rows.map(({ vendor_name, tester_name, test_case_id, ...defect }) => ({
    ...defect,
    vendors: { name: vendor_name },
    test_results: {
      assignments: {
        testers: { name: tester_name },
        test_cases: { test_case_id },
      },
    },
  }));
}

export async function updateDefectStatus(defectId: string, status: string) {
  const { rows } = await query("update defects set status = $1 where id = $2 returning *", [status, defectId]);
  if (!rows[0]) throw new AppError("VALIDATION", "Unable to update defect.");
  return rows[0];
}
