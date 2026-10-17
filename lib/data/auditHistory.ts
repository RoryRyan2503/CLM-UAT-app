import "server-only";
import { query } from "@/lib/db/pool";
import type { Database } from "@/lib/types/database";

export async function listAuditHistory(limit = 200) {
  type HistoryRow = Database["public"]["Tables"]["result_history"]["Row"];
  type Row = HistoryRow & {
    tester_name: string | null;
    assignment_id: string;
    vendor_name: string;
    test_case_id: string;
  };
  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(1000, Math.trunc(limit))) : 200;
  const { rows } = await query<Row>(
    `select h.*, t.name as tester_name, tr.assignment_id, v.name as vendor_name, tc.test_case_id
     from result_history h
     left join testers t on t.id = h.changed_by_tester_id
     join test_results tr on tr.id = h.test_result_id
     join assignments a on a.id = tr.assignment_id
     join vendors v on v.id = a.vendor_id
     join test_cases tc on tc.id = a.test_case_id
     order by h.created_at desc limit $1`,
    [safeLimit],
  );
  return rows.map(({ tester_name, assignment_id, vendor_name, test_case_id, ...history }) => ({
    ...history,
    testers: tester_name ? { name: tester_name } : null,
    test_results: {
      assignment_id,
      assignments: { vendors: { name: vendor_name }, test_cases: { test_case_id } },
    },
  }));
}
