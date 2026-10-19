import { z } from "zod";

export const importedTestCaseRowSchema = z.object({
  testCaseId: z.string().trim().min(1, "Test Case ID is required."),
  functionalArea: z.string().trim().min(1, "Functional Area is required."),
  persona: z.string().trim().optional().default(""),
  scenario: z.string().trim().min(1, "Scenario is required."),
  useCase: z.string().trim().optional().default(""),
  suggestedSteps: z.string().trim().optional().default(""),
  sirionSteps: z.string().trim().optional().default(""),
  sirionFeature: z.string().trim().optional().default(""),
  sirionAvailability: z.enum(["Available and Configured", "Not Configured", "Not Available", "Not Specified"]),
  ironcladSteps: z.string().trim().optional().default(""),
  ironcladFeature: z.string().trim().optional().default(""),
  ironcladAvailability: z.enum(["Available and Configured", "Not Configured", "Not Available", "Not Specified"]),
  expectedResult: z.string().trim().min(1, "Expected Result is required."),
  requiredEvidence: z.string().trim().optional(),
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
  fullCatalog: boolean;
  validRows: ImportedTestCaseRow[];
  rowErrors: ImportRowError[];
  duplicateTestCaseIds: string[];
}
