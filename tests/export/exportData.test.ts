import { beforeEach, describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";
import { getExportRecords } from "@/lib/data/exportData";
import { buildCombinedWorkbook, buildVendorWorkbook, type ExportRecord } from "@/lib/export/buildWorkbook";
import { query } from "@/lib/db/pool";
import type { QueryResultRow } from "pg";

vi.mock("@/lib/db/pool", () => ({ query: vi.fn() }));

const mockedQuery = vi.mocked(query);

function record(vendor: string, tester: string, testCase: string): ExportRecord {
  const createdAt = "2026-10-19T10:00:00.000Z";
  const assignmentId = `${vendor}-${tester}-${testCase}`;
  return {
    testCase: { id: testCase, test_case_id: testCase, functional_area: "Intake", persona: "Legal",
      scenario: "Create", suggested_steps: "Save", expected_result: "Created", required_evidence: "Screenshot",
      source_row_number: null, created_at: createdAt, updated_at: createdAt },
    tester: { id: tester, name: tester, email: null, department: null, persona: "Procurement", persona_id: null,
      is_active: true, created_at: createdAt, updated_at: createdAt },
    vendor: { id: vendor, name: vendor, slug: vendor.toLowerCase(), created_at: createdAt },
    assignment: { id: assignmentId, tester_id: tester, test_case_id: testCase, vendor_id: vendor,
      is_active: false, created_at: createdAt },
    result: null, defect: null, evidence: [],
  };
}

function sql() {
  return mockedQuery.mock.calls[0][0].replace(/\s+/g, " ").trim();
}

function mockRows(rows: unknown[]) {
  mockedQuery.mockResolvedValue({
    command: "SELECT",
    oid: 0,
    fields: [],
    rows: rows as QueryResultRow[],
    rowCount: rows.length,
  });
}

describe("export data query", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRows([]);
  });

  it("keeps precise assignment/result/defect associations and all active states", async () => {
    await getExportRecords();
    expect(mockedQuery.mock.calls[0][1]).toEqual([]);
    const statement = sql();
    expect(statement).toContain("join testers t on t.id = a.tester_id");
    expect(statement).toContain("join vendors v on v.id = a.vendor_id");
    expect(statement).toContain("join test_cases tc on tc.id = a.test_case_id");
    expect(statement).toContain("left join test_results tr on tr.assignment_id = a.id");
    expect(statement).toContain("left join defects d on d.id = tr.defect_id and d.test_result_id = tr.id and d.vendor_id = v.id");
    expect(statement).toContain("order by tc.test_case_id, t.id, v.slug, a.id");
    expect(statement).not.toMatch(/where (?:a|t)\.is_active/);
    expect(statement).not.toContain("where v.slug");
  });

  it.each(["ironclad", "sirion"] as const)("parameterizes the %s vendor filter", async (vendor) => {
    await getExportRecords(vendor);
    expect(mockedQuery.mock.calls[0][1]).toEqual([vendor]);
    expect(sql()).toContain("where v.slug = $1");
    expect(sql()).not.toContain(`'${vendor}'`);
  });

  it("selects only safe tester fields including actual persona and aggregates evidence without row multiplication", async () => {
    await getExportRecords();
    const statement = sql();
    for (const field of ["id", "name", "email", "department", "persona", "persona_id", "is_active", "created_at", "updated_at"]) {
      expect(statement).toContain(`'${field}', t.${field}`);
    }
    for (const field of ["id", "test_result_id", "kind", "file_name", "mime_type", "size_bytes", "created_at", "created_by_tester_id"]) {
      expect(statement).toContain(`'${field}', e.${field}`);
    }
    expect(statement).toContain("select jsonb_agg(jsonb_build_object(");
    expect(statement).toContain("order by e.created_at, e.id");
    expect(statement).toContain("from evidence e where e.test_result_id = tr.id");
    expect(statement).toContain("'[]'::jsonb) as evidence");
    expect(statement).not.toMatch(/join evidence|to_jsonb\(t\)|to_jsonb\(e\)|access_code|token_hash|password|storage_path|e\.url/i);
  });

  it("round-trips query output with distinct tools, testers and cases, including inactive unstarted assignments", async () => {
    const entries = [record("Ironclad", "Alice", "AI-01"), record("Sirion", "Alice", "AI-01"),
      record("Ironclad", "Bob", "AI-01"), record("Ironclad", "Alice", "AI-02")];
    mockRows(entries);
    const records = await getExportRecords();
    const workbook = XLSX.read(buildCombinedWorkbook(records), { type: "buffer" });
    const exported = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets["Combined Results"], { defval: "" });
    expect(exported).toHaveLength(entries.length);
    expect(exported.map((row) => [row["Assignment ID"], row["Vendor"], row["Tester"], row["Test Case ID"]]))
      .toEqual(entries.map((entry) => [entry.assignment.id, entry.vendor.name, entry.tester.name, entry.testCase.test_case_id]));
    for (const row of exported) {
      expect(row).toMatchObject({ "Persona": "Legal", "Tester Persona": "Procurement", "Tester Email": "",
        "Tester Department": "", "Tester Persona ID": "", "Test Case Source Row Number": "",
        "Assignment Active": "No", "Tester Active": "Yes", "Status": "Not Started", "Evidence Count": 0 });
    }
    mockRows(entries.filter((entry) => entry.vendor.slug === "sirion"));
    const vendorRecords = await getExportRecords("sirion");
    const vendorWorkbook = XLSX.read(buildVendorWorkbook(vendorRecords, "Sirion"), { type: "buffer" });
    expect(XLSX.utils.sheet_to_json(vendorWorkbook.Sheets["Sirion"])).toMatchObject([
      { "Vendor": "Sirion", "Tester": "Alice", "Test Case ID": "AI-01", "Assignment ID": "Sirion-Alice-AI-01" },
    ]);
  });

  it("propagates database failures instead of returning a misleading empty export", async () => {
    mockedQuery.mockRejectedValue(new Error("Database unavailable"));
    await expect(getExportRecords()).rejects.toThrow("Database unavailable");
  });
});