import { describe, expect, it } from "vitest";
import { planAssignmentChanges } from "@/lib/assignmentPlan";

describe("planAssignmentChanges", () => {
  it("creates one row per selected test case and vendor without duplicating existing rows", () => {
    const plan = planAssignmentChanges(
      [{ id: "a1", test_case_id: "case-a", vendor_id: "ironclad", is_active: true }],
      ["case-a", "case-b"],
      ["ironclad", "sirion"],
      true,
    );

    expect(plan.deactivateIds).toEqual([]);
    expect(plan.reactivateIds).toEqual([]);
    expect(plan.insertPairs).toEqual([
      { test_case_id: "case-a", vendor_id: "sirion" },
      { test_case_id: "case-b", vendor_id: "ironclad" },
      { test_case_id: "case-b", vendor_id: "sirion" },
    ]);
  });

  it("reactivates inactive assignments without creating replacements", () => {
    const plan = planAssignmentChanges(
      [
        { id: "old-i", test_case_id: "case-a", vendor_id: "ironclad", is_active: false },
        { id: "old-s", test_case_id: "case-a", vendor_id: "sirion", is_active: false },
      ],
      ["case-a"],
      ["ironclad", "sirion"],
      true,
    );

    expect(plan.reactivateIds).toEqual(["old-i", "old-s"]);
    expect(plan.insertPairs).toEqual([]);
  });

  it("soft-disables only selected active assignment ids and leaves history rows alone", () => {
    const plan = planAssignmentChanges(
      [
        { id: "keep", test_case_id: "case-a", vendor_id: "ironclad", is_active: true },
        { id: "remove-i", test_case_id: "case-b", vendor_id: "ironclad", is_active: true },
        { id: "remove-s", test_case_id: "case-b", vendor_id: "sirion", is_active: true },
        { id: "already-off", test_case_id: "case-b", vendor_id: "sirion-legacy", is_active: false },
      ],
      ["case-b"],
      ["ironclad", "sirion"],
      false,
    );

    expect(plan.deactivateIds).toEqual(["remove-i", "remove-s"]);
    expect(plan.reactivateIds).toEqual([]);
    expect(plan.insertPairs).toEqual([]);
  });
});
