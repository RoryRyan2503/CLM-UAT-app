import * as XLSX from "xlsx";
import {
  importedTestCaseRowSchema,
  type ImportPreview,
  type ImportRowError,
  type ImportedTestCaseRow,
} from "@/lib/validation/import";

type FieldName =
  | "testCaseId" | "functionalArea" | "persona" | "scenario" | "useCase"
  | "suggestedSteps" | "sirionSteps" | "sirionFeature" | "sirionAvailability"
  | "ironcladSteps" | "ironcladFeature" | "ironcladAvailability"
  | "expectedResult" | "requiredEvidence";

type HeaderMap = Partial<Record<FieldName, number>>;

const HEADER_ALIASES: Record<FieldName, string[]> = {
  testCaseId: ["testcaseid", "testid"],
  functionalArea: ["functionalarea"],
  persona: ["persona", "personas"],
  scenario: ["honeywellscenario", "scenario"],
  useCase: ["usecases", "usecase"],
  expectedResult: ["whatyoushouldsee", "expectedresult"],
  requiredEvidence: ["requiredevidence"],
  suggestedSteps: ["suggestedsteps"],
  sirionSteps: ["sirionsteps", "sirionsuggestedsteps"],
  sirionFeature: ["sirionfeature", "sirionfeaturedescription"],
  sirionAvailability: ["sirionavailability"],
  ironcladSteps: ["ironcladsteps", "ironcladsuggestedsteps"],
  ironcladFeature: ["ironcladfeature", "ironcladfeaturedescription"],
  ironcladAvailability: ["ironcladavailability"],
};

const LEGACY_REQUIRED: FieldName[] = ["testCaseId", "functionalArea", "scenario", "suggestedSteps", "expectedResult"];
const CATALOG_REQUIRED: FieldName[] = [
  "testCaseId", "functionalArea", "persona", "scenario", "useCase", "expectedResult",
  "sirionSteps", "sirionFeature", "sirionAvailability",
  "ironcladSteps", "ironcladFeature", "ironcladAvailability",
];

type Availability = "Available and Configured" | "Not Configured" | "Not Available" | "Not Specified";

function normalizeHeader(value: unknown): string {
  return String(value ?? "").normalize("NFKD").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function resolveHeader(row: unknown[]): { columns: HeaderMap; fullCatalog: boolean } | null {
  const normalizedHeaders = row.map(normalizeHeader);
  const columns: HeaderMap = {};
  for (const [field, aliases] of Object.entries(HEADER_ALIASES) as [FieldName, string[]][]) {
    const index = normalizedHeaders.findIndex((header) => aliases.includes(header));
    if (index !== -1) columns[field] = index;
  }
  const isCatalog = CATALOG_REQUIRED.every((field) => columns[field] !== undefined);
  const isLegacy = LEGACY_REQUIRED.every((field) => columns[field] !== undefined);
  return isCatalog || isLegacy ? { columns, fullCatalog: isCatalog } : null;
}

function normalizeAvailability(value: string): Availability | null {
  const normalized = normalizeHeader(value);
  if (!normalized) return "Not Specified";
  if (normalized === "availableconfigured" || normalized === "availableandconfigured") return "Available and Configured";
  if (normalized === "availablenotconfigured" || normalized === "notconfigured") return "Not Configured";
  if (normalized === "notavailable" || normalized === "notanavailablefeatureintheclm") return "Not Available";
  if (normalized === "notspecified") return "Not Specified";
  return null;
}

/**
 * Parses an uploaded workbook (.xlsx or .csv) and extracts the canonical test-definition
 * columns, preserving source text verbatim. Locates the header row by signature rather than
 * a fixed row number, since source workbooks may include leading metadata rows (as the
 * reference CSV export does: tester-name/department/persona/etc. rows before the real header).
 */
export function parseTestCaseWorkbook(buffer: ArrayBuffer | Buffer, fileName: string): ImportPreview {
    const isCsv = fileName.toLowerCase().endsWith(".csv");
    const csvText = isCsv ? (Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer)).toString("utf8") : undefined;
    const workbook = isCsv
      ? XLSX.read(csvText!, { type: "string" })
      : XLSX.read(buffer, { type: "buffer" });
  const sheetNames = workbook.SheetNames;

  const preferredCatalogSheet = sheetNames.find((name) => normalizeHeader(name) === "testcases");
  const usedSheetName =
    (preferredCatalogSheet && sheetHasSupportedHeader(workbook, preferredCatalogSheet) ? preferredCatalogSheet : undefined) ??
    sheetNames.find((name) => name === "User Test Results" && sheetHasSupportedHeader(workbook, name)) ??
    sheetNames.find((name) => sheetHasSupportedHeader(workbook, name)) ??
    sheetNames[0];

  if (!usedSheetName) {
    throw new Error(`No worksheets found in ${fileName}.`);
  }

  const sheet = workbook.Sheets[usedSheetName];
  const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: true, raw: false });

  const headerRowIndex = rows.findIndex((row) => Boolean(row && resolveHeader(row)));
  if (headerRowIndex === -1) throw new Error(`Could not locate a supported test-case header row in "${usedSheetName}".`);
  const header = resolveHeader(rows[headerRowIndex]);
  if (!header) throw new Error(`Could not map test-case columns in "${usedSheetName}".`);
  const { columns: columnIndex, fullCatalog } = header;

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

    const value = (field: FieldName) => columnIndex[field] === undefined ? "" : String(row[columnIndex[field]!] ?? "");
    const legacySteps = value("suggestedSteps").trim();
    const sirionAvailability = normalizeAvailability(value("sirionAvailability"));
    const ironcladAvailability = normalizeAvailability(value("ironcladAvailability"));
    if (!sirionAvailability || !ironcladAvailability) {
      const invalid = !sirionAvailability ? "Sirion availability" : "Ironclad availability";
      rowErrors.push({ rowNumber, message: `${invalid} has an unsupported value.` });
      continue;
    }

    const candidate = {
      testCaseId: value("testCaseId"),
      functionalArea: value("functionalArea"),
      persona: value("persona"),
      scenario: value("scenario"),
      useCase: value("useCase").trim() || value("scenario").trim(),
      suggestedSteps: legacySteps,
      sirionSteps: value("sirionSteps").trim() || legacySteps,
      sirionFeature: value("sirionFeature").trim(),
      sirionAvailability,
      ironcladSteps: value("ironcladSteps").trim() || legacySteps,
      ironcladFeature: value("ironcladFeature").trim(),
      ironcladAvailability,
      expectedResult: value("expectedResult"),
      requiredEvidence: columnIndex.requiredEvidence === undefined ? undefined : value("requiredEvidence"),
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
    fullCatalog,
    validRows,
    rowErrors,
    duplicateTestCaseIds: Array.from(duplicateTestCaseIds),
  };
}

function sheetHasSupportedHeader(workbook: XLSX.WorkBook, sheetName: string): boolean {
  const sheet = workbook.Sheets[sheetName];
  const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: true, raw: false });
  return rows.some((row) => Boolean(row && resolveHeader(row)));
}
