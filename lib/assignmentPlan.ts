export interface ExistingAssignment {
  id: string;
  test_case_id: string;
  vendor_id: string;
  is_active: boolean;
}

export interface AssignmentPlan {
  deactivateIds: string[];
  reactivateIds: string[];
  insertPairs: { test_case_id: string; vendor_id: string }[];
}

export function planAssignmentChanges(
  existing: ExistingAssignment[],
  testCaseIds: string[],
  vendorIds: string[],
  assigned: boolean,
): AssignmentPlan {
  const selected = new Set(testCaseIds);
  if (!assigned) {
    return {
      deactivateIds: existing.filter((row) => row.is_active && selected.has(row.test_case_id)).map((row) => row.id),
      reactivateIds: [],
      insertPairs: [],
    };
  }

  const knownPairs = new Set(existing.map((row) => `${row.test_case_id}:${row.vendor_id}`));
  return {
    deactivateIds: [],
    reactivateIds: existing.filter((row) => !row.is_active && selected.has(row.test_case_id)).map((row) => row.id),
    insertPairs: testCaseIds.flatMap((test_case_id) =>
      vendorIds
        .filter((vendor_id) => !knownPairs.has(`${test_case_id}:${vendor_id}`))
        .map((vendor_id) => ({ test_case_id, vendor_id })),
    ),
  };
}
