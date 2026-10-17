import "server-only";
import { query, withTransaction } from "@/lib/db/pool";
import { AppError } from "@/lib/actionResult";
import type { Database } from "@/lib/types/database";

type DefectRow = Database["public"]["Tables"]["defects"]["Row"];
type DefectFlatRow = DefectRow & {
  vendor_name: string;
  tester_name: string;
  test_case_id: string;
};

export async function createDefect(
  testerId: string,
  input: { testResultId: string; vendorId: string; title: string; description?: string; severity?: string },
) {
  return withTransaction(async (client) => {
    const { rows: results } = await client.query<{ id: string }>(
      `select tr.id from test_results tr join assignments a on a.id = tr.assignment_id
       where tr.id = $1 and a.tester_id = $2 and a.is_active = true for update of tr`,
      [input.testResultId, testerId],
    );
    if (!results[0]) throw new AppError("FORBIDDEN", "You may only log defects for your own results.");
    const { rows: codes } = await client.query<{ defect_code: string }>(
      "select 'DEF-' || lpad(nextval('defect_code_seq')::text, 4, '0') as defect_code",
    );
    const { rows } = await client.query(
      `insert into defects
         (defect_code, test_result_id, vendor_id, title, description, severity, created_by_tester_id)
       values ($1, $2, $3, $4, $5, $6, $7) returning *`,
      [codes[0].defect_code, input.testResultId, input.vendorId, input.title,
        input.description ?? null, input.severity ?? null, testerId],
    );
    return rows[0];
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
