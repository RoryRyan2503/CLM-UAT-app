import * as XLSX from "xlsx";
import {
  importedTestCaseRowSchema,
  type ImportPreview,
  type ImportRowError,
  type ImportedTestCaseRow,
} from "@/lib/validation/import";

const REQUIRED_HEADER_SIGNATURE = [
  "Test Case ID",
  "Functional Area",
  "Persona",
  "Scenario",
  "Suggested Steps",
  "Expected Result",
  "Required Evidence",
];

const PREFERRED_SHEET_NAME = "User Test Results";

/**
 * Parses an uploaded workbook (.xlsx or .csv) and extracts the canonical test-definition
 * columns, preserving source text verbatim. Locates the header row by signature rather than
 * a fixed row number, since source workbooks may include leading metadata rows (as the
 * reference CSV export does: tester-name/department/persona/etc. rows before the real header).
 */
export function parseTestCaseWorkbook(buffer: ArrayBuffer | Buffer, fileName: string): ImportPreview {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheetNames = workbook.SheetNames;

  const usedSheetName =
    sheetNames.find((name) => name === PREFERRED_SHEET_NAME) ??
    sheetNames.find((name) => sheetHasHeaderSignature(workbook, name)) ??
    sheetNames[0];

  if (!usedSheetName) {
    throw new Error(`No worksheets found in ${fileName}.`);
  }

  const sheet = workbook.Sheets[usedSheetName];
  const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: true, raw: false });

  const headerRowIndex = findHeaderRowIndex(rows);
  if (headerRowIndex === -1) {
    throw new Error(
      `Could not locate the expected header row (${REQUIRED_HEADER_SIGNATURE.join(", ")}) in "${usedSheetName}".`,
    );
  }

  const header = rows[headerRowIndex].map((cell) => String(cell ?? "").trim());
  const columnIndex = {
    testCaseId: header.indexOf("Test Case ID"),
    functionalArea: header.indexOf("Functional Area"),
    persona: header.indexOf("Persona"),
    scenario: header.indexOf("Scenario"),
    suggestedSteps: header.indexOf("Suggested Steps"),
    expectedResult: header.indexOf("Expected Result"),
    requiredEvidence: header.indexOf("Required Evidence"),
  };

  const validRows: ImportedTestCaseRow[] = [];
  const rowErrors: ImportRowError[] = [];
  const seenIds = new Map<string, number>();
  const duplicateTestCaseIds = new Set<string>();

  for (let i = headerRowIndex + 1; i < rows.length; i++) {
    const row = rows[i];
    const rowNumber = i + 1; // 1-indexed, matches what a user sees in Excel
    if (!row || row.every((cell) => cell === undefined || cell === null || String(cell).trim() === "")) {
      continue; // skip fully blank rows
    }

    const candidate = {
      testCaseId: String(row[columnIndex.testCaseId] ?? "").trim(),
      functionalArea: String(row[columnIndex.functionalArea] ?? "").trim(),
      persona: String(row[columnIndex.persona] ?? "").trim(),
      scenario: String(row[columnIndex.scenario] ?? "").trim(),
      suggestedSteps: String(row[columnIndex.suggestedSteps] ?? "").trim(),
      expectedResult: String(row[columnIndex.expectedResult] ?? "").trim(),
      requiredEvidence: String(row[columnIndex.requiredEvidence] ?? "").trim(),
      sourceRowNumber: rowNumber,
    };

    const parsed = importedTestCaseRowSchema.safeParse(candidate);
    if (!parsed.success) {
      rowErrors.push({
        rowNumber,
        message: parsed.error.issues.map((issue) => issue.message).join("; "),
      });
      continue;
    }

    if (seenIds.has(parsed.data.testCaseId)) {
      duplicateTestCaseIds.add(parsed.data.testCaseId);
    } else {
      seenIds.set(parsed.data.testCaseId, rowNumber);
    }
    validRows.push(parsed.data);
  }

  return {
    sheetNames,
    usedSheetName,
    validRows,
    rowErrors,
    duplicateTestCaseIds: Array.from(duplicateTestCaseIds),
  };
}

function findHeaderRowIndex(rows: unknown[][]): number {
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;
    const normalized = row.map((cell) => String(cell ?? "").trim());
    const hasAll = REQUIRED_HEADER_SIGNATURE.every((required) => normalized.includes(required));
    if (hasAll) return i;
  }
  return -1;
}

function sheetHasHeaderSignature(workbook: XLSX.WorkBook, sheetName: string): boolean {
  const sheet = workbook.Sheets[sheetName];
  const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: true, raw: false });
  return findHeaderRowIndex(rows) !== -1;
}
