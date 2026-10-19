import "server-only";
import { query } from "@/lib/db/pool";
import { AppError } from "@/lib/actionResult";
import type { Database } from "@/lib/types/database";

type TestResultRow = Database["public"]["Tables"]["test_results"]["Row"];
type AssignmentRow = Database["public"]["Tables"]["assignments"]["Row"];
type EvidenceRow = Database["public"]["Tables"]["evidence"]["Row"];
type DefectRow = Database["public"]["Tables"]["defects"]["Row"];

export interface VendorWorkflowSlice {
  vendorSlug: string;
  vendorName: string;
  assignment: AssignmentRow;
  result: TestResultRow;
  evidence: EvidenceRow[];
  defect: DefectRow | null;
}

export interface TestCaseWorkflow {
  testCase: Database["public"]["Tables"]["test_cases"]["Row"];
  ironclad: VendorWorkflowSlice;
  sirion: VendorWorkflowSlice;
  comparison: Database["public"]["Tables"]["comparisons"]["Row"] | null;
}

export async function getTestCaseWorkflow(
  testerId: string,
  testCaseUuid: string,
): Promise<TestCaseWorkflow> {
  const { rows: testCases } = await query<Database["public"]["Tables"]["test_cases"]["Row"]>(
    "select * from test_cases where id = $1",
    [testCaseUuid],
  );
  const testCase = testCases[0];
  if (!testCase) throw new AppError("NOT_FOUND", "Test case not found.");

  type AssignmentJoin = {
    assignment: AssignmentRow;
    vendor_slug: string;
    vendor_name: string;
    result: TestResultRow;
  };
  const { rows: assignments } = await query<AssignmentJoin>(
    `select to_jsonb(a) as assignment, v.slug as vendor_slug, v.name as vendor_name,
       to_jsonb(tr) as result
     from assignments a join vendors v on v.id = a.vendor_id
     join test_results tr on tr.assignment_id = a.id
     where a.tester_id = $1 and a.test_case_id = $2 and a.is_active = true`,
    [testerId, testCaseUuid],
  );
  if (assignments.length === 0) throw new AppError("FORBIDDEN", "You are not assigned to this test case.");

  const resultIds = assignments.map(({ result }) => result.id);
  const [{ rows: evidenceRows }, { rows: defects }] = await Promise.all([
    query<EvidenceRow>(
      "select * from evidence where test_result_id = any($1::uuid[]) order by created_at desc",
      [resultIds],
    ),
    query<DefectRow>(
      `select * from defects where test_result_id = any($1::uuid[]) order by created_at desc, id desc`,
      [resultIds],
    ),
  ]);
  const evidenceByResult = new Map<string, EvidenceRow[]>();
  for (const evidence of evidenceRows) {
    const list = evidenceByResult.get(evidence.test_result_id) ?? [];
    list.push(evidence);
    evidenceByResult.set(evidence.test_result_id, list);
  }
  const defectsByResult = new Map<string, DefectRow[]>();
  for (const defect of defects) {
    const resultDefects = defectsByResult.get(defect.test_result_id) ?? [];
    resultDefects.push(defect);
    defectsByResult.set(defect.test_result_id, resultDefects);
  }
  const slices = new Map<string, VendorWorkflowSlice>();
  for (const row of assignments) {
    const resultDefects = defectsByResult.get(row.result.id) ?? [];
    const defect = resultDefects.find((item) => item.id === row.result.defect_id) ?? resultDefects[0] ?? null;
    slices.set(row.vendor_slug, {
      vendorSlug: row.vendor_slug,
      vendorName: row.vendor_name,
      assignment: row.assignment,
      result: row.result,
      evidence: evidenceByResult.get(row.result.id) ?? [],
      defect,
    });
  }
  const ironclad = slices.get("ironclad");
  const sirion = slices.get("sirion");
  if (!ironclad || !sirion) throw new AppError("NOT_FOUND", "Both vendor assignments are required for this test case.");

  const { rows: comparisons } = await query<Database["public"]["Tables"]["comparisons"]["Row"]>(
    "select * from comparisons where tester_id = $1 and test_case_id = $2",
    [testerId, testCaseUuid],
  );
  return { testCase, ironclad, sirion, comparison: comparisons[0] ?? null };
}
