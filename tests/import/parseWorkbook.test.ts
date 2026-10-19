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

const CATALOG_CSV = [
  "Test case ID,Functional area,Honeywell scenario,Persona,Use case(s),What you should see,Sirion – steps,Sirion – feature,Sirion – availability,Ironclad – steps,Ironclad – feature,Ironclad – availability, Sirion – your result",
  'AI-01,AI,Clause review,Legal,Review a clause,Relevant clauses are found,"1. Search",Clause analysis,Available – Configured,"1. Open workflow",Workflow builder,Available – NOT Configured,Pass',
  'AI-02,AI,Contract intake,Procurement,Create a contract,Contract is saved,"1. Create",Intake,Not an available feature in the CLM,"1. Submit",Intake form,,Fail',
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

  it("maps the revised catalog columns and canonicalizes vendor availability without importing evaluation columns", () => {
    const preview = parseTestCaseWorkbook(Buffer.from(CATALOG_CSV, "utf-8"), "catalog.csv");
    expect(preview.fullCatalog).toBe(true);
    expect(preview.validRows).toHaveLength(2);
    expect(preview.validRows[0]).toMatchObject({
      testCaseId: "AI-01",
      useCase: "Review a clause",
      sirionAvailability: "Available and Configured",
      ironcladAvailability: "Not Configured",
    });
    expect(preview.validRows[1].ironcladAvailability).toBe("Not Specified");
    expect(preview.rowErrors).toHaveLength(0);
  });

  it("marks legacy imports as partial so they cannot archive omitted cases", () => {
    const preview = parseTestCaseWorkbook(Buffer.from(SAMPLE_CSV, "utf-8"), "legacy.csv");
    expect(preview.fullCatalog).toBe(false);
  });
});
