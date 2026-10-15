import { describe, expect, it } from "vitest";
import { parseTestCaseWorkbook } from "@/lib/import/parseWorkbook";

const SAMPLE_CSV = [
  "Tester Name,,,,,,,",
  "Department,,,,,,,",
  "Persona,,,,,,,",
  "Record/Contract ID,,,,,,,",
  "Test Date,,,,,,,",
  ",,,,,,,",
  "Test Case ID,Functional Area,Persona,Scenario,Suggested Steps,Expected Result,Required Evidence,Actual Result",
  'AI-01,AI,Requesters,Confirm clause extraction.,"1. Step one.\n2. Step two.",Pass if results match.,"Output, log",',
  "AI-02,AI,,Confirm summaries.,1. Ask for a summary.,Pass if summary matches.,Summary capture,",
  "AI-01,AI,,Duplicate row for AI-01.,1. Repeat.,Pass if duplicate ignored.,Duplicate evidence,",
  ",AI,,Missing ID row.,1. Step.,Pass if ignored.,Evidence,",
].join("\n");

describe("parseTestCaseWorkbook", () => {
  it("locates the header row after leading metadata rows and maps the seven canonical fields", () => {
    const preview = parseTestCaseWorkbook(Buffer.from(SAMPLE_CSV, "utf-8"), "sample.csv");

    expect(preview.usedSheetName).toBeTruthy();
    expect(preview.validRows.length).toBeGreaterThanOrEqual(2);
    expect(preview.validRows[0]).toMatchObject({
      testCaseId: "AI-01",
      functionalArea: "AI",
      persona: "Requesters",
      scenario: "Confirm clause extraction.",
    });
    expect(preview.validRows[0].suggestedSteps).toContain("1. Step one.");
  });

  it("flags duplicate test case IDs without dropping the first occurrence", () => {
    const preview = parseTestCaseWorkbook(Buffer.from(SAMPLE_CSV, "utf-8"), "sample.csv");
    expect(preview.duplicateTestCaseIds).toContain("AI-01");
  });

  it("reports a row error for a missing Test Case ID instead of silently skipping it", () => {
    const preview = parseTestCaseWorkbook(Buffer.from(SAMPLE_CSV, "utf-8"), "sample.csv");
    expect(preview.rowErrors.length).toBeGreaterThan(0);
  });
});
