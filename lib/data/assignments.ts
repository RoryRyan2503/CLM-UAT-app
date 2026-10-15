import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/adminClient";
import { AppError } from "@/lib/actionResult";
import { embeddedOne } from "@/lib/supabase/embedded";

export interface AssignmentListItem {
  testCaseId: string;
  testCaseUuid: string;
  functionalArea: string;
  scenario: string;
  ironcladStatus: string;
  sirionStatus: string;
  comparisonComplete: boolean;
  preferredVendor: string | null;
}

export async function listAssignmentsForTester(testerId: string): Promise<AssignmentListItem[]> {
  const supabase = createSupabaseAdminClient();

  const { data: assignments, error: assignmentError } = await supabase
    .from("assignments")
    .select("test_case_id, vendors(slug), test_results(status)")
    .eq("tester_id", testerId)
    .eq("is_active", true);
  if (assignmentError) throw new AppError("NOT_FOUND", "Unable to load assignments.");

  type AssignmentRow = {
    test_case_id: string;
    vendors: { slug: string } | null;
    test_results: { status: string } | { status: string }[] | null;
  };
  const assignmentRows = (assignments ?? []) as unknown as AssignmentRow[];
  const assignedTestCaseIds = [...new Set(assignmentRows.map((assignment) => assignment.test_case_id))];
  if (assignedTestCaseIds.length === 0) return [];

  const { data: testCases, error: testCaseError } = await supabase
    .from("test_cases")
    .select("id, test_case_id, functional_area, scenario")
    .in("id", assignedTestCaseIds)
    .order("test_case_id", { ascending: true });
  if (testCaseError) throw new AppError("NOT_FOUND", "Unable to load assigned test cases.");

  const { data: comparisons, error: comparisonError } = await supabase
    .from("comparisons")
    .select("test_case_id, preferred_vendor")
    .eq("tester_id", testerId)
    .not("preferred_vendor", "is", null);
  if (comparisonError) throw new AppError("NOT_FOUND", "Unable to load comparisons.");

  const statusByTestCase = new Map<string, { ironclad: string; sirion: string }>();
  for (const row of assignmentRows) {
    const entry = statusByTestCase.get(row.test_case_id) ?? { ironclad: "Not Started", sirion: "Not Started" };
    const status = embeddedOne(row.test_results)?.status ?? "Not Started";
    if (row.vendors?.slug === "ironclad") entry.ironclad = status;
    if (row.vendors?.slug === "sirion") entry.sirion = status;
    statusByTestCase.set(row.test_case_id, entry);
  }

  const preferredVendorByTestCase = new Map(
    (comparisons ?? []).map((comparison) => [comparison.test_case_id, comparison.preferred_vendor]),
  );

  const comparedTestCaseIds = new Set((comparisons ?? []).map((c) => c.test_case_id));

  return (testCases ?? []).map((testCase) => {
    const statuses = statusByTestCase.get(testCase.id) ?? { ironclad: "Not Started", sirion: "Not Started" };
    return {
      testCaseId: testCase.test_case_id,
      testCaseUuid: testCase.id,
      functionalArea: testCase.functional_area,
      scenario: testCase.scenario,
      ironcladStatus: statuses.ironclad,
      sirionStatus: statuses.sirion,
      comparisonComplete: comparedTestCaseIds.has(testCase.id),
      preferredVendor: preferredVendorByTestCase.get(testCase.id) ?? null,
    };
  });
}
