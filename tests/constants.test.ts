import { describe, expect, it } from "vitest";
import { isCompletedStatus, isCriticalResult, COMPLETED_STATUSES } from "@/lib/constants";

describe("isCompletedStatus", () => {
  it("treats all completed statuses as complete", () => {
    for (const status of COMPLETED_STATUSES) {
      expect(isCompletedStatus(status)).toBe(true);
    }
  });

  it("treats Not Started and In Progress as incomplete", () => {
    expect(isCompletedStatus("Not Started")).toBe(false);
    expect(isCompletedStatus("In Progress")).toBe(false);
    expect(isCompletedStatus(null)).toBe(false);
    expect(isCompletedStatus(undefined)).toBe(false);
  });
});

describe("isCriticalResult", () => {
  it("flags Critical severity Fail results", () => {
    expect(isCriticalResult({ severity: "Critical", status: "Fail" })).toBe(true);
  });

  it("does not flag Critical severity on a Pass", () => {
    expect(isCriticalResult({ severity: "Critical", status: "Pass" })).toBe(false);
  });

  it("does not flag non-Critical severities", () => {
    expect(isCriticalResult({ severity: "High", status: "Fail" })).toBe(false);
  });
});
