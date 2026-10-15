import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/adminClient";
import { AppError } from "@/lib/actionResult";
import type { Database } from "@/lib/types/database";
import { embeddedOne } from "@/lib/supabase/embedded";

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
  const supabase = createSupabaseAdminClient();

  const { data: testCase, error: testCaseError } = await supabase
    .from("test_cases")
    .select("*")
    .eq("id", testCaseUuid)
    .maybeSingle();
  if (testCaseError || !testCase) throw new AppError("NOT_FOUND", "Test case not found.");

  const { data: assignments, error: assignmentsError } = await supabase
    .from("assignments")
    .select("*, vendors(slug, name), test_results(*)")
    .eq("tester_id", testerId)
    .eq("test_case_id", testCaseUuid)
    .eq("is_active", true);
  if (assignmentsError || !assignments || assignments.length === 0) {
    throw new AppError("FORBIDDEN", "You are not assigned to this test case.");
  }

  type AssignmentWithJoins = AssignmentRow & {
    vendors: { slug: string; name: string } | null;
    test_results: TestResultRow | TestResultRow[] | null;
  };

  const slices = new Map<string, VendorWorkflowSlice>();
  for (const row of assignments as unknown as AssignmentWithJoins[]) {
    const slug = row.vendors?.slug;
    const result = embeddedOne(row.test_results);
    if (!slug || !result) continue;

    const { data: evidence } = await supabase
      .from("evidence")
      .select("*")
      .eq("test_result_id", result.id)
      .order("created_at", { ascending: false });

    let defect: DefectRow | null = null;
    if (result.defect_id) {
      const { data: defectRow } = await supabase
        .from("defects")
        .select("*")
        .eq("id", result.defect_id)
        .maybeSingle();
      defect = defectRow ?? null;
    }

    slices.set(slug, {
      vendorSlug: slug,
      vendorName: row.vendors?.name ?? slug,
      assignment: row,
      result,
      evidence: evidence ?? [],
      defect,
    });
  }

  const ironclad = slices.get("ironclad");
  const sirion = slices.get("sirion");
  if (!ironclad || !sirion) {
    throw new AppError("NOT_FOUND", "Both vendor assignments are required for this test case.");
  }

  const { data: comparison } = await supabase
    .from("comparisons")
    .select("*")
    .eq("tester_id", testerId)
    .eq("test_case_id", testCaseUuid)
    .maybeSingle();

  return { testCase, ironclad, sirion, comparison: comparison ?? null };
}
