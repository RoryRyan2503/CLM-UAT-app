import * as XLSX from "xlsx";
import type { Database } from "@/lib/types/database";

type TestResultRow = Database["public"]["Tables"]["test_results"]["Row"];
type TestCaseRow = Database["public"]["Tables"]["test_cases"]["Row"];
type AssignmentRow = Database["public"]["Tables"]["assignments"]["Row"];
type TesterRow = Database["public"]["Tables"]["testers"]["Row"];
type VendorRow = Database["public"]["Tables"]["vendors"]["Row"];
type DefectRow = Database["public"]["Tables"]["defects"]["Row"];

export interface ExportRecord {
  testCase: TestCaseRow;
  assignment: AssignmentRow;
  tester: TesterRow;
  vendor: VendorRow;
  result: TestResultRow | null;
  defect: DefectRow | null;
}

const COLUMNS: { header: string; value: (r: ExportRecord) => string | number | boolean | null }[] = [
  { header: "Test Case ID", value: (r) => r.testCase.test_case_id },
  { header: "Functional Area", value: (r) => r.testCase.functional_area },
  { header: "Persona", value: (r) => r.testCase.persona },
  { header: "Scenario", value: (r) => r.testCase.scenario },
  { header: "Suggested Steps", value: (r) => r.testCase.suggested_steps },
  { header: "Expected Result", value: (r) => r.testCase.expected_result },
  { header: "Required Evidence", value: (r) => r.testCase.required_evidence },
  { header: "Vendor", value: (r) => r.vendor.name },
  { header: "Tester", value: (r) => r.tester.name },
  { header: "Actual Result", value: (r) => r.result?.actual_result ?? "" },
  { header: "Status", value: (r) => r.result?.status ?? "Not Started" },
  { header: "Grade", value: (r) => r.result?.grade ?? "" },
  { header: "Severity", value: (r) => r.result?.severity ?? "" },
  { header: "Defect ID", value: (r) => r.defect?.defect_code ?? "" },
  { header: "Workaround / Notes", value: (r) => r.result?.workaround_notes ?? "" },
  { header: "Usability Rating", value: (r) => r.result?.usability_rating ?? "" },
  { header: "Configuration Required", value: (r) => boolToYesNo(r.result?.configuration_required) },
  { header: "Vendor Assistance Required", value: (r) => boolToYesNo(r.result?.vendor_assistance_required) },
  { header: "Started At", value: (r) => r.result?.started_at ?? "" },
  { header: "Completed At", value: (r) => r.result?.completed_at ?? "" },
];

function boolToYesNo(value: boolean | null | undefined): string {
  if (value === true) return "Yes";
  if (value === false) return "No";
  return "";
}

function buildSheet(records: ExportRecord[]): XLSX.WorkSheet {
  const rows = records.map((record) => {
    const row: Record<string, unknown> = {};
    for (const column of COLUMNS) {
      row[column.header] = column.value(record);
    }
    return row;
  });
  return XLSX.utils.json_to_sheet(rows, { header: COLUMNS.map((c) => c.header) });
}

export function buildCombinedWorkbook(records: ExportRecord[]): Buffer {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, buildSheet(records), "Combined Results");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}

export function buildVendorWorkbook(records: ExportRecord[], vendorName: string): Buffer {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, buildSheet(records), vendorName.slice(0, 31));
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}
