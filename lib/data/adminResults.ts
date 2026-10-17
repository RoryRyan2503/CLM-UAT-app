import "server-only";
import { query } from "@/lib/db/pool";
import { AppError } from "@/lib/actionResult";

export interface AdminResultRow {
  resultId: string;
  testerName: string;
  vendorName: string;
  testCaseId: string;
  functionalArea: string;
  status: string;
  severity: string | null;
  grade: string | null;
  evidence: { id: string; label: string; kind: string; url: string | null }[];
}

export async function listAllResults(): Promise<AdminResultRow[]> {
  type FlatRow = {
    id: string; status: string; severity: string | null; grade: string | null;
    tester_name: string | null; vendor_name: string | null; test_case_id: string | null;
    functional_area: string | null; evidence_id: string | null; evidence_kind: string | null;
    file_name: string | null; evidence_url: string | null;
  };
  try {
    const { rows } = await query<FlatRow>(
      `select tr.id, tr.status, tr.severity, tr.grade, t.name as tester_name,
         v.name as vendor_name, tc.test_case_id, tc.functional_area,
         e.id as evidence_id, e.kind as evidence_kind, e.file_name, e.url as evidence_url
       from test_results tr
       join assignments a on a.id = tr.assignment_id
       join testers t on t.id = a.tester_id
       join vendors v on v.id = a.vendor_id
       join test_cases tc on tc.id = a.test_case_id
       left join evidence e on e.test_result_id = tr.id
       order by tr.created_at desc, e.created_at desc`,
    );
    const grouped = new Map<string, AdminResultRow>();
    for (const row of rows) {
      let result = grouped.get(row.id);
      if (!result) {
        result = {
          resultId: row.id,
          testerName: row.tester_name ?? "Unknown",
          vendorName: row.vendor_name ?? "Unknown",
          testCaseId: row.test_case_id ?? "Unknown",
          functionalArea: row.functional_area ?? "Unknown",
          status: row.status,
          severity: row.severity,
          grade: row.grade,
          evidence: [],
        };
        grouped.set(row.id, result);
      }
      if (row.evidence_id && row.evidence_kind) {
        result.evidence.push({
          id: row.evidence_id,
          label: row.evidence_kind === "url" ? row.evidence_url ?? "Link" : row.file_name ?? "File",
          kind: row.evidence_kind,
          url: row.evidence_url,
        });
      }
    }
    return [...grouped.values()];
  } catch {
    throw new AppError("NOT_FOUND", "Unable to load results.");
  }
}
