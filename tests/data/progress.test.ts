import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@/lib/db/pool", () => ({ query: mocks.query }));

import { getProgressOverview } from "@/lib/data/progress";

const ids = {
  alice: "00000000-0000-4000-8000-000000000001",
  bob: "00000000-0000-4000-8000-000000000002",
  caseOne: "00000000-0000-4000-8000-000000000003",
  caseTwo: "00000000-0000-4000-8000-000000000004",
};

const testers = [
  { id: ids.alice, name: "Alice" },
  { id: ids.bob, name: "Bob" },
  { id: "00000000-0000-4000-8000-000000000005", name: "Cara" },
];

function assignment(overrides: Record<string, unknown>) {
  return {
    tester_id: ids.alice,
    tester_name: "Alice",
    vendor_slug: "ironclad",
    vendor_name: "Ironclad",
    test_case_id: "AI-01",
    scenario: "Review terms",
    functional_area: "AI",
    status: "Pass",
    started_at: "2026-10-20T10:00:00.000Z",
    completed_at: "2026-10-20T10:20:00.000Z",
    grade: "A",
    severity: null,
    usability_rating: 4,
    improvement_needed: false,
    configuration_required: false,
    vendor_assistance_required: false,
    defect_status: null,
    preferred_vendor: "Ironclad",
    comparison_comments: null,
    ...overrides,
  };
}

describe("admin Overview analytics", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("counts participation, deduplicates comparisons, compares paired grades, and flags follow-up signals", async () => {
    mocks.query
      .mockResolvedValueOnce({ rows: testers })
      .mockResolvedValueOnce({ rows: [
        assignment({}),
        assignment({
          vendor_slug: "sirion",
          vendor_name: "Sirion",
          test_case_id: "AI-01",
          status: "Fail",
          grade: "C",
          severity: "Critical",
          usability_rating: 1,
          improvement_needed: true,
          configuration_required: true,
          vendor_assistance_required: true,
          defect_status: "Open",
        }),
        assignment({
          tester_id: ids.bob,
          tester_name: "Bob",
          vendor_slug: "sirion",
          vendor_name: "Sirion",
          test_case_id: "IN-01",
          scenario: "Create intake",
          functional_area: "Intake",
          status: "Not Started",
          started_at: null,
          completed_at: null,
          grade: null,
          severity: null,
          usability_rating: null,
          preferred_vendor: null,
        }),
      ] });

    const result = await getProgressOverview();

    expect(result.participation).toMatchObject({
      activeTesters: 3,
      startedTesters: 1,
      notStartedTesters: 1,
      completedAllTesters: 1,
      unassignedTesters: 1,
      assignedTesters: 2,
      totalAssignments: 3,
      startedAssignments: 2,
      completedAssignments: 2,
    });
    expect(result.participation.testers.find((tester) => tester.testerId === ids.bob)?.state).toBe("Not started");
    expect(result.participation.testers.find((tester) => tester.testerName === "Cara")?.state).toBe("Unassigned");
    expect(result.vendorComparison.preferences).toEqual([{ preferredVendor: "Ironclad", count: 1 }]);
    expect(result.vendorComparison.pairedGrades).toMatchObject({ ironcladHigher: 1, sirionHigher: 0 });
    expect(result.heatmap.find((cell) => cell.functionalArea === "AI" && cell.vendorSlug === "sirion"))
      .toMatchObject({ failed: 1, completed: 1 });
    expect(result.grades.find((row) => row.functionalArea === "Intake" && row.vendorSlug === "sirion")?.counts)
      .toContainEqual({ grade: "Missing", count: 1 });
    expect(result.attention[0]).toMatchObject({
      testCaseId: "AI-01",
      vendorName: "Sirion",
      reasons: expect.arrayContaining(["Critical failure", "Improvement requested", "Low usability rating", "Configuration required", "Vendor assistance required", "Defect open"]),
    });
  });
});
