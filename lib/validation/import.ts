import { z } from "zod";

export const importedTestCaseRowSchema = z.object({
  testCaseId: z.string().trim().min(1, "Test Case ID is required."),
  functionalArea: z.string().trim().min(1, "Functional Area is required."),
  persona: z.string().trim().optional().default(""),
  scenario: z.string().trim().min(1, "Scenario is required."),
  suggestedSteps: z.string().trim().min(1, "Suggested Steps is required."),
  expectedResult: z.string().trim().min(1, "Expected Result is required."),
  requiredEvidence: z.string().trim().min(1, "Required Evidence is required."),
  sourceRowNumber: z.number().int().positive(),
});

export type ImportedTestCaseRow = z.infer<typeof importedTestCaseRowSchema>;

export interface ImportRowError {
  rowNumber: number;
  message: string;
}

export interface ImportPreview {
  sheetNames: string[];
  usedSheetName: string;
  validRows: ImportedTestCaseRow[];
  rowErrors: ImportRowError[];
  duplicateTestCaseIds: string[];
}
