import * as XLSX from "xlsx";
import { z } from "zod";

export interface TesterRosterRow {
  name: string;
  email: string;
  department: string;
  persona: string;
  rowNumber: number;
}

export interface TesterRosterError {
  rowNumber: number;
  message: string;
}

export interface TesterRosterParseResult {
  rows: TesterRosterRow[];
  errors: TesterRosterError[];
}

const rowSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(200, "Name must be 200 characters or fewer."),
  email: z.union([z.literal(""), z.string().trim().email("Email is invalid.").max(320)]),
  department: z.string().trim().max(200, "Department must be 200 characters or fewer."),
  persona: z.string().trim().min(1, "Persona is required.").max(120, "Persona must be 120 characters or fewer."),
});

const headerAliases: Record<keyof z.infer<typeof rowSchema>, string[]> = {
  name: ["name", "fullname", "testername"],
  email: ["email", "emailaddress"],
  department: ["department", "team"],
  persona: ["persona"],
};

function normalizeHeader(value: unknown): string {
  return String(value ?? "").trim().toLowerCase().replace(/[^a-z]/g, "");
}

function isBlank(row: unknown[]): boolean {
  return row.every((value) => value === undefined || value === null || String(value).trim() === "");
}

export function parseTesterRoster(buffer: Buffer, fileName: string): TesterRosterParseResult {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("The uploaded file contains no worksheet.");

  const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], {
    header: 1,
    blankrows: true,
    raw: false,
  });
  let headerRowIndex = -1;
  let columns: Partial<Record<keyof z.infer<typeof rowSchema>, number>> = {};

  for (let index = 0; index < Math.min(rows.length, 20); index += 1) {
    const headers = rows[index].map(normalizeHeader);
    const found: Partial<Record<keyof z.infer<typeof rowSchema>, number>> = {};
    for (const field of Object.keys(headerAliases) as (keyof typeof headerAliases)[]) {
      const column = headers.findIndex((header) => headerAliases[field].includes(header));
      if (column >= 0) found[field] = column;
    }
    if (found.name !== undefined && found.persona !== undefined) {
      headerRowIndex = index;
      columns = found;
      break;
    }
  }

  if (headerRowIndex < 0 || columns.name === undefined || columns.persona === undefined) {
    throw new Error(`Could not find Name and Persona columns in "${fileName}".`);
  }

  const parsedRows: TesterRosterRow[] = [];
  const errors: TesterRosterError[] = [];
  const firstEmailRow = new Map<string, number>();

  for (let index = headerRowIndex + 1; index < rows.length; index += 1) {
    const row = rows[index];
    if (!row || isBlank(row)) continue;
    const rowNumber = index + 1;
    const parsed = rowSchema.safeParse({
      name: row[columns.name] ?? "",
      email: columns.email === undefined ? "" : row[columns.email] ?? "",
      department: columns.department === undefined ? "" : row[columns.department] ?? "",
      persona: row[columns.persona] ?? "",
    });
    if (!parsed.success) {
      errors.push({
        rowNumber,
        message: parsed.error.issues.map((issue) => issue.message).join("; "),
      });
      continue;
    }

    const emailKey = parsed.data.email.toLowerCase();
    if (emailKey && firstEmailRow.has(emailKey)) {
      errors.push({ rowNumber, message: `Email duplicates row ${firstEmailRow.get(emailKey)}.` });
      continue;
    }
    if (emailKey) firstEmailRow.set(emailKey, rowNumber);
    parsedRows.push({ ...parsed.data, rowNumber });
  }

  if (parsedRows.length === 0 && errors.length === 0) {
    errors.push({ rowNumber: headerRowIndex + 2, message: "No tester rows found." });
  }

  return { rows: parsedRows, errors };
}