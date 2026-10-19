import * as XLSX from "xlsx";
import type { Database } from "@/lib/types/database";

type TestResultRow = Database["public"]["Tables"]["test_results"]["Row"];
type TestCaseRow = Database["public"]["Tables"]["test_cases"]["Row"];
type AssignmentRow = Database["public"]["Tables"]["assignments"]["Row"];
type TesterRow = Database["public"]["Tables"]["testers"]["Row"];
type VendorRow = Database["public"]["Tables"]["vendors"]["Row"];
type DefectRow = Database["public"]["Tables"]["defects"]["Row"];
type EvidenceRow = Pick<Database["public"]["Tables"]["evidence"]["Row"],
  "id" | "test_result_id" | "kind" | "file_name" | "mime_type" | "size_bytes" | "created_at" | "created_by_tester_id">;

export interface ExportRecord {
  testCase: TestCaseRow;
  assignment: AssignmentRow;
  tester: Omit<TesterRow, "access_code_hash" | "access_code_lookup">;
  vendor: VendorRow;
  result: TestResultRow | null;
  defect: DefectRow | null;
  evidence?: EvidenceRow[];
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
  { header: "Feature Adequate", value: (r) => boolToYesNo(r.result?.feature_adequate) },
  { header: "Improvement Needed", value: (r) => boolToYesNo(r.result?.improvement_needed) },
  { header: "Improvement Description", value: (r) => r.result?.improvement_description ?? "" },
  { header: "Feature User Friendly", value: (r) => boolToYesNo(r.result?.feature_user_friendly) },
  { header: "Blocked Reason", value: (r) => r.result?.blocked_reason ?? "" },
  { header: "Blocked Owner", value: (r) => r.result?.blocked_owner ?? "" },
  { header: "Blocked Target Date", value: (r) => r.result?.blocked_target_date ?? "" },
  { header: "Assignment ID", value: (r) => r.assignment.id },
  { header: "Assignment Active", value: (r) => boolToYesNo(r.assignment.is_active) },
  { header: "Assignment Created At", value: (r) => r.assignment.created_at },
  { header: "Test Case Record ID", value: (r) => r.testCase.id },
  { header: "Test Case Source Row Number", value: (r) => r.testCase.source_row_number ?? "" },
  { header: "Test Case Created At", value: (r) => r.testCase.created_at },
  { header: "Test Case Updated At", value: (r) => r.testCase.updated_at },
  { header: "Vendor ID", value: (r) => r.vendor.id },
  { header: "Vendor Slug", value: (r) => r.vendor.slug },
  { header: "Vendor Created At", value: (r) => r.vendor.created_at },
  { header: "Tester ID", value: (r) => r.tester.id },
  { header: "Tester Email", value: (r) => r.tester.email ?? "" },
  { header: "Tester Department", value: (r) => r.tester.department ?? "" },
  { header: "Tester Persona", value: (r) => r.tester.persona ?? "" },
  { header: "Tester Persona ID", value: (r) => r.tester.persona_id ?? "" },
  { header: "Tester Active", value: (r) => boolToYesNo(r.tester.is_active) },
  { header: "Tester Created At", value: (r) => r.tester.created_at },
  { header: "Tester Updated At", value: (r) => r.tester.updated_at },
  { header: "Result ID", value: (r) => r.result?.id ?? "" },
  { header: "Result Version", value: (r) => r.result?.version ?? "" },
  { header: "Result Updated By Tester ID", value: (r) => r.result?.updated_by_tester_id ?? "" },
  { header: "Result Linked Defect ID", value: (r) => r.result?.defect_id ?? "" },
  { header: "Result Created At", value: (r) => r.result?.created_at ?? "" },
  { header: "Result Updated At", value: (r) => r.result?.updated_at ?? "" },
  { header: "Defect Record ID", value: (r) => r.defect?.id ?? "" },
  { header: "Defect Test Result ID", value: (r) => r.defect?.test_result_id ?? "" },
  { header: "Defect Vendor ID", value: (r) => r.defect?.vendor_id ?? "" },
  { header: "Defect Title", value: (r) => r.defect?.title ?? "" },
  { header: "Defect Description", value: (r) => r.defect?.description ?? "" },
  { header: "Defect Severity", value: (r) => r.defect?.severity ?? "" },
  { header: "Defect Status", value: (r) => r.defect?.status ?? "" },
  { header: "Defect Retest Assignment ID", value: (r) => r.defect?.retest_assignment_id ?? "" },
  { header: "Defect Created By Tester ID", value: (r) => r.defect?.created_by_tester_id ?? "" },
  { header: "Defect Created At", value: (r) => r.defect?.created_at ?? "" },
  { header: "Defect Updated At", value: (r) => r.defect?.updated_at ?? "" },
  { header: "Evidence Count", value: (r) => r.evidence?.length ?? 0 },
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
  appendEvidenceSheet(workbook, records);
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}

export function buildVendorWorkbook(records: ExportRecord[], vendorName: string): Buffer {
  const workbook = XLSX.utils.book_new();
  const vendorRecords = records.filter((record) =>
    record.vendor.name === vendorName || record.vendor.slug === vendorName.toLowerCase());
  XLSX.utils.book_append_sheet(workbook, buildSheet(vendorRecords), vendorName.slice(0, 31));
  appendEvidenceSheet(workbook, vendorRecords);
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}

function appendEvidenceSheet(workbook: XLSX.WorkBook, records: ExportRecord[]): void {
  const header = ["Evidence ID", "Result ID", "Assignment ID", "Test Case Record ID", "Test Case ID",
    "Vendor ID", "Vendor", "Tester ID", "Tester", "Kind", "File Name", "MIME Type", "Size Bytes",
    "Created At", "Created By Tester ID"];
  /* SECURITY_NOTE: Export metadata only; never include storage paths, URLs, or signed credentials. */
  const rows = records.flatMap((record) => (record.evidence ?? []).map((evidence) => [
    evidence.id, evidence.test_result_id, record.assignment.id, record.testCase.id, record.testCase.test_case_id,
    record.vendor.id, record.vendor.name, record.tester.id, record.tester.name, evidence.kind,
    evidence.file_name ?? "", evidence.mime_type ?? "", evidence.size_bytes ?? "", evidence.created_at,
    evidence.created_by_tester_id ?? "",
  ]));
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([header, ...rows]), "Evidence");
}
