import "server-only";
import { query } from "@/lib/db/pool";
import { AppError } from "@/lib/actionResult";

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
  try {
    const { rows } = await query<{
      test_case_id: string;
      test_case_uuid: string;
      functional_area: string;
      scenario: string;
      ironclad_status: string;
      sirion_status: string;
      comparison_complete: boolean;
      preferred_vendor: string | null;
    }>(
      `select tc.test_case_id, tc.id as test_case_uuid, tc.functional_area, tc.scenario,
         coalesce(max(tr.status) filter (where v.slug = 'ironclad'), 'Not Started') as ironclad_status,
         coalesce(max(tr.status) filter (where v.slug = 'sirion'), 'Not Started') as sirion_status,
         (c.test_case_id is not null) as comparison_complete, c.preferred_vendor
       from assignments a
       join test_cases tc on tc.id = a.test_case_id
       join vendors v on v.id = a.vendor_id
       left join test_results tr on tr.assignment_id = a.id
       left join comparisons c on c.tester_id = a.tester_id and c.test_case_id = a.test_case_id
         and c.preferred_vendor is not null
       where a.tester_id = $1 and a.is_active = true
       group by tc.id, c.test_case_id, c.preferred_vendor
       order by tc.test_case_id`,
      [testerId],
    );
    return rows.map((row) => ({
      testCaseId: row.test_case_id,
      testCaseUuid: row.test_case_uuid,
      functionalArea: row.functional_area,
      scenario: row.scenario,
      ironcladStatus: row.ironclad_status,
      sirionStatus: row.sirion_status,
      comparisonComplete: row.comparison_complete,
      preferredVendor: row.preferred_vendor,
    }));
  } catch {
    throw new AppError("NOT_FOUND", "Unable to load assignments.");
  }
}
