import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { buildCombinedWorkbook, buildVendorWorkbook, type ExportRecord } from "@/lib/export/buildWorkbook";

const timestamp = "2026-10-19T10:00:00.000Z";
const originalHeaders = ["Test Case ID", "Functional Area", "Persona", "Scenario", "Suggested Steps",
  "Expected Result", "Required Evidence", "Vendor", "Tester", "Actual Result", "Status", "Grade",
  "Severity", "Defect ID", "Workaround / Notes", "Usability Rating", "Configuration Required",
  "Vendor Assistance Required", "Started At", "Completed At"];

function record(vendor = "Ironclad", tester = "Alice", testCase = "AI-01"): ExportRecord {
  const assignmentId = `${vendor}-${tester}-${testCase}`;
  const resultId = `result-${assignmentId}`;
  return {
    testCase: { id: `case-${testCase}`, test_case_id: testCase, functional_area: "AI", persona: "Legal",
      scenario: "Review", suggested_steps: "Open\nReview, then save", expected_result: "Saved",
      required_evidence: "Screenshot", source_row_number: 8, created_at: timestamp, updated_at: timestamp },
    assignment: { id: assignmentId, tester_id: tester, vendor_id: vendor, test_case_id: `case-${testCase}`,
      is_active: false, created_at: timestamp },
    tester: { id: tester, name: tester, email: `${tester}@example.test`, department: "Procurement",
      persona: "Buyer", persona_id: "persona-buyer", is_active: false, created_at: timestamp, updated_at: timestamp },
    vendor: { id: vendor, name: vendor, slug: vendor.toLowerCase(), created_at: timestamp },
    result: { id: resultId, assignment_id: assignmentId, actual_result: "Blocked saving", feature_adequate: false,
      improvement_needed: true, improvement_description: "Save faster\nKeep formatting", feature_user_friendly: false,
      status: "Blocked", grade: "C", severity: "High", defect_id: `defect-${resultId}`, workaround_notes: "Retry",
      usability_rating: 2, configuration_required: false, vendor_assistance_required: true,
      blocked_reason: "Unavailable", blocked_owner: "Support", blocked_target_date: "2026-10-20",
      started_at: timestamp, completed_at: timestamp, version: 3, updated_by_tester_id: tester,
      created_at: timestamp, updated_at: timestamp },
    defect: { id: `defect-${resultId}`, defect_code: `DEF-${assignmentId}`, test_result_id: resultId,
      vendor_id: vendor, title: "Cannot save", description: "Save fails\nTry again", severity: "Critical",
      status: "Retest Required", retest_assignment_id: `retest-${assignmentId}`, created_by_tester_id: tester,
      created_at: timestamp, updated_at: timestamp },
    evidence: [{ id: `evidence-${resultId}`, test_result_id: resultId, kind: "file", file_name: "proof.png",
      mime_type: "image/png", size_bytes: 1024, created_at: timestamp, created_by_tester_id: tester }],
  };
}

function read(buffer: Buffer) {
  return XLSX.read(buffer, { type: "buffer" });
}

function rows(workbook: XLSX.WorkBook, sheet = workbook.SheetNames[0]) {
  return XLSX.utils.sheet_to_json<Record<string, string | number>>(workbook.Sheets[sheet], { defval: "" });
}

describe("Excel exports", () => {
  it("preserves every original column and value and appends every persisted evaluation and metadata field", () => {
    const entry = record();
    const workbook = read(buildCombinedWorkbook([entry]));
    const headers = XLSX.utils.sheet_to_json<string[]>(workbook.Sheets["Combined Results"], { header: 1 })[0];
    expect(headers.slice(0, originalHeaders.length)).toEqual(originalHeaders);
    const [actual] = rows(workbook);
    expect(originalHeaders.map((header) => actual[header])).toEqual([
      "AI-01", "AI", "Legal", "Review", "Open\nReview, then save", "Saved", "Screenshot", "Ironclad", "Alice",
      "Blocked saving", "Blocked", "C", "High", "DEF-Ironclad-Alice-AI-01", "Retry", 2, "No", "Yes", timestamp, timestamp,
    ]);
    const added = {
      "Feature Adequate": "No", "Improvement Needed": "Yes", "Improvement Description": "Save faster\nKeep formatting",
      "Feature User Friendly": "No", "Blocked Reason": "Unavailable", "Blocked Owner": "Support",
      "Blocked Target Date": "2026-10-20", "Assignment ID": entry.assignment.id, "Assignment Active": "No",
      "Assignment Created At": timestamp, "Test Case Record ID": entry.testCase.id, "Test Case Source Row Number": 8,
      "Test Case Created At": timestamp, "Test Case Updated At": timestamp, "Vendor ID": "Ironclad",
      "Vendor Slug": "ironclad", "Vendor Created At": timestamp, "Tester ID": "Alice", "Tester Email": "Alice@example.test",
      "Tester Department": "Procurement", "Tester Persona": "Buyer", "Tester Persona ID": "persona-buyer",
      "Tester Active": "No", "Tester Created At": timestamp, "Tester Updated At": timestamp,
      "Result ID": entry.result!.id, "Result Version": 3, "Result Updated By Tester ID": "Alice",
      "Result Linked Defect ID": entry.result!.defect_id, "Result Created At": timestamp, "Result Updated At": timestamp, "Defect Record ID": entry.defect!.id,
      "Defect Test Result ID": entry.result!.id, "Defect Vendor ID": "Ironclad", "Defect Title": "Cannot save",
      "Defect Description": "Save fails\nTry again", "Defect Severity": "Critical", "Defect Status": "Retest Required",
      "Defect Retest Assignment ID": entry.defect!.retest_assignment_id, "Defect Created By Tester ID": "Alice",
      "Defect Created At": timestamp, "Defect Updated At": timestamp, "Evidence Count": 1,
    };
    expect(headers.slice(originalHeaders.length)).toEqual(Object.keys(added));
    expect(actual).toEqual({ ...Object.fromEntries(originalHeaders.map((header) => [header, actual[header]])), ...added });
    expect(rows(workbook, "Evidence")).toEqual([{
      "Evidence ID": entry.evidence![0].id, "Result ID": entry.result!.id, "Assignment ID": entry.assignment.id,
      "Test Case Record ID": entry.testCase.id, "Test Case ID": "AI-01", "Vendor ID": "Ironclad", "Vendor": "Ironclad",
      "Tester ID": "Alice", "Tester": "Alice", "Kind": "file", "File Name": "proof.png", "MIME Type": "image/png",
      "Size Bytes": 1024, "Created At": timestamp, "Created By Tester ID": "Alice",
    }]);
  });

  it.each([true, false, null])("distinguishes nullable boolean %s from unanswered evaluations", (value) => {
    const entry = record();
    Object.assign(entry.result!, { feature_adequate: value, improvement_needed: value, feature_user_friendly: value,
      configuration_required: value, vendor_assistance_required: value });
    const [actual] = rows(read(buildCombinedWorkbook([entry])));
    for (const header of ["Feature Adequate", "Improvement Needed", "Feature User Friendly",
      "Configuration Required", "Vendor Assistance Required"]) {
      expect(actual[header]).toBe(value === null ? "" : value ? "Yes" : "No");
    }
  });

  it("keeps absent results blank with the existing Not Started status", () => {
    const entry = record();
    entry.result = null;
    entry.defect = null;
    entry.evidence = [];
    const [actual] = rows(read(buildCombinedWorkbook([entry])));
    expect(actual.Status).toBe("Not Started");
    for (const header of ["Feature Adequate", "Improvement Needed", "Feature User Friendly", "Improvement Description",
      "Blocked Reason", "Blocked Owner", "Blocked Target Date", "Result ID", "Result Version", "Result Updated By Tester ID", "Result Linked Defect ID",
      "Result Created At", "Result Updated At", "Defect Record ID", "Defect Title", "Defect Description"]) {
      expect(actual[header]).toBe("");
    }
    expect(actual["Evidence Count"]).toBe(0);
  });

  it("keeps vendor, tester, case and evidence associations precise without multiplying result rows", () => {
    const entries = [record(), record("Sirion"), record("Ironclad", "Bob"), record("Ironclad", "Alice", "AI-02")];
    entries[0].evidence!.push({ ...entries[0].evidence![0], id: "url-evidence", kind: "url",
      file_name: null, mime_type: null, size_bytes: null, created_by_tester_id: null });
    const workbook = read(buildCombinedWorkbook(entries));
    expect(rows(workbook).map((row) => row["Assignment ID"])).toEqual(entries.map((entry) => entry.assignment.id));
    expect(rows(workbook, "Evidence")).toHaveLength(5);
    for (const entry of entries) {
      const [actual] = rows(workbook).filter((row) => row["Assignment ID"] === entry.assignment.id);
      expect(actual).toMatchObject({ "Vendor": entry.vendor.name, "Tester": entry.tester.name,
        "Test Case ID": entry.testCase.test_case_id, "Result ID": entry.result!.id, "Evidence Count": entry.evidence!.length });
      expect(rows(workbook, "Evidence").filter((row) => row["Result ID"] === entry.result!.id))
        .toHaveLength(entry.evidence!.length);
    }
    for (const vendor of ["Ironclad", "Sirion"]) {
      const vendorWorkbook = read(buildVendorWorkbook(entries, vendor));
      expect(rows(vendorWorkbook).map((row) => row["Assignment ID"]))
        .toEqual(entries.filter((entry) => entry.vendor.name === vendor).map((entry) => entry.assignment.id));
      expect(rows(vendorWorkbook, "Evidence").every((row) => row.Vendor === vendor)).toBe(true);
    }
    expect(rows(workbook, "Evidence")[1]).toMatchObject({ "Kind": "url", "File Name": "", "MIME Type": "",
      "Size Bytes": "", "Created By Tester ID": "" });
  });

  it("writes only literal text and allowlisted metadata, never authentication or evidence secrets", () => {
    const entry = record();
    Object.assign(entry.tester, { access_code_hash: "private-hash", access_code_lookup: "private-lookup" });
    Object.assign(entry.evidence![0], { storage_path: "private-storage", url: "https://example.test/?token=private-token" });
    entry.result!.improvement_description = '=HYPERLINK("https://example.test")';
    const workbook = read(buildCombinedWorkbook([entry]));
    const values = JSON.stringify(workbook.Sheets);
    for (const secret of ["private-hash", "private-lookup", "private-storage", "private-token"]) {
      expect(values).not.toContain(secret);
    }
    expect(rows(workbook)[0]["Improvement Description"]).toBe(entry.result!.improvement_description);
    for (const sheet of Object.values(workbook.Sheets)) {
      for (const [address, cell] of Object.entries(sheet)) {
        if (!address.startsWith("!")) expect(cell.f).toBeUndefined();
      }
    }
  });

  it("retains headers for empty combined and per-vendor workbooks", () => {
    for (const buffer of [buildCombinedWorkbook([]), buildVendorWorkbook([], "Sirion")]) {
      const workbook = read(buffer);
      expect(rows(workbook)).toEqual([]);
      expect(rows(workbook, "Evidence")).toEqual([]);
      expect(XLSX.utils.sheet_to_json<string[]>(workbook.Sheets[workbook.SheetNames[0]], { header: 1 })[0]
        .slice(0, originalHeaders.length)).toEqual(originalHeaders);
    }
  });
});