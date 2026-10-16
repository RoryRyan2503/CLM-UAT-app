import { describe, expect, it } from "vitest";
import { getConditionalRequirementErrors, type TestResultDraftInput } from "@/lib/validation/testResult";

function baseInput(overrides: Partial<TestResultDraftInput> = {}): TestResultDraftInput {
  return {
    assignmentId: "00000000-0000-0000-0000-000000000000",
    version: 1,
    status: "In Progress",
    actualResult: null,
    grade: null,
    severity: null,
    evidence: null,
    defectId: null,
    workaroundNotes: null,
    usabilityRating: null,
    configurationRequired: null,
    vendorAssistanceRequired: null,
    blockedReason: null,
    blockedOwner: null,
    blockedTargetDate: null,
    startedAt: null,
    completedAt: null,
    ...overrides,
  };
}

describe("getConditionalRequirementErrors", () => {
  it("requires actual result, a specific severity, and a defect for Fail", () => {
    const errors = getConditionalRequirementErrors(baseInput({ status: "Fail" }));
    expect(errors.actualResult).toBeDefined();
    expect(errors.severity).toBeDefined();
    expect(errors.defectId).toBeDefined();
  });

  it("accepts Pass and Fail without evidence when other requirements are met", () => {
    const passErrors = getConditionalRequirementErrors(
      baseInput({ status: "Pass", grade: "A", actualResult: "Worked as expected" }),
    );
    const failErrors = getConditionalRequirementErrors(
      baseInput({
        status: "Fail",
        actualResult: "It broke",
        severity: "High",
        defectId: "11111111-1111-1111-1111-111111111111",
      }),
    );

    expect(passErrors).toEqual({});
    expect(failErrors).toEqual({});
  });

  it("accepts a complete Fail submission", () => {
    const errors = getConditionalRequirementErrors(
      baseInput({
        status: "Fail",
        actualResult: "It broke",
        severity: "High",
        evidence: { kind: "url", url: "https://example.com/evidence.png" },
        defectId: "11111111-1111-1111-1111-111111111111",
      }),
    );
    expect(errors).toEqual({});
  });

  it("rejects Fail with severity N/A", () => {
    const errors = getConditionalRequirementErrors(
      baseInput({
        status: "Fail",
        actualResult: "It broke",
        severity: "N/A",
        evidence: { kind: "url", url: "https://example.com/e.png" },
        defectId: "11111111-1111-1111-1111-111111111111",
      }),
    );
    expect(errors.severity).toBeDefined();
  });

  it("requires reason, owner, and target date for Blocked", () => {
    const errors = getConditionalRequirementErrors(baseInput({ status: "Blocked" }));
    expect(errors.blockedReason).toBeDefined();
    expect(errors.blockedOwner).toBeDefined();
    expect(errors.blockedTargetDate).toBeDefined();
  });

  it("requires actual result and grade A or B for Pass", () => {
    const errors = getConditionalRequirementErrors(baseInput({ status: "Pass", grade: "C" }));
    expect(errors.actualResult).toBeDefined();
    expect(errors.grade).toBeDefined();
  });

  it("accepts Pass with grade B and evidence", () => {
    const errors = getConditionalRequirementErrors(
      baseInput({
        status: "Pass",
        grade: "B",
        actualResult: "Worked as expected",
        evidence: { kind: "url", url: "https://example.com/e.png" },
      }),
    );
    expect(errors).toEqual({});
  });

  it("does not enforce Pass/Fail/Blocked rules for other statuses", () => {
    const errors = getConditionalRequirementErrors(baseInput({ status: "Not Applicable" }));
    expect(errors).toEqual({});
  });

  it("requires an improvement description only when improvement is needed", () => {
    const missingDescription = getConditionalRequirementErrors(
      baseInput({ status: "In Progress", improvementNeeded: true, improvementDescription: " " }),
    );
    expect(missingDescription.improvementDescription).toBeDefined();

    const described = getConditionalRequirementErrors(
      baseInput({ status: "In Progress", improvementNeeded: true, improvementDescription: "Simplify the review flow." }),
    );
    expect(described.improvementDescription).toBeUndefined();

    const notNeeded = getConditionalRequirementErrors(
      baseInput({ status: "In Progress", improvementNeeded: false, improvementDescription: null }),
    );
    expect(notNeeded.improvementDescription).toBeUndefined();
  });
});
