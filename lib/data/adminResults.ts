import "server-only";
import { query } from "@/lib/db/pool";
import { AppError } from "@/lib/actionResult";

export interface AdminResultRow {
  resultId: string;
  testerName: string;
  testerEmail: string | null;
  testerPersona: string | null;
  vendorName: string;
  testCaseId: string;
  scenario: string;
  functionalArea: string;
  status: string;
  severity: string | null;
  grade: string | null;
  usabilityRating: number | null;
  improvementNeeded: boolean | null;
  configurationRequired: boolean | null;
  vendorAssistanceRequired: boolean | null;
  startedAt: string | null;
  completedAt: string | null;
  updatedAt: string;
  evidence: { id: string; label: string; kind: string; url: string | null }[];
}

export async function listAllResults(): Promise<AdminResultRow[]> {
  type FlatRow = {
    id: string; status: string; severity: string | null; grade: string | null;
    tester_name: string | null; tester_email: string | null; tester_persona: string | null;
    vendor_name: string | null; test_case_id: string | null; scenario: string | null;
    functional_area: string | null; usability_rating: number | null; improvement_needed: boolean | null;
    configuration_required: boolean | null; vendor_assistance_required: boolean | null;
    started_at: string | null; completed_at: string | null; updated_at: string;
    evidence_id: string | null; evidence_kind: string | null;
    file_name: string | null; evidence_url: string | null;
  };
  try {
    const { rows } = await query<FlatRow>(
      `select tr.id, tr.status, tr.severity, tr.grade, t.name as tester_name, t.email as tester_email,
         coalesce(p.name, t.persona) as tester_persona, v.name as vendor_name,
         tc.test_case_id, tc.scenario, tc.functional_area,
         tr.usability_rating, tr.improvement_needed, tr.configuration_required, tr.vendor_assistance_required,
         to_char(tr.started_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as started_at,
         to_char(tr.completed_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as completed_at,
         to_char(tr.updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as updated_at,
         e.id as evidence_id, e.kind as evidence_kind, e.file_name, e.url as evidence_url
       from test_results tr
       join assignments a on a.id = tr.assignment_id
       join testers t on t.id = a.tester_id
       left join personas p on p.id = t.persona_id
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
          testerEmail: row.tester_email,
          testerPersona: row.tester_persona,
          vendorName: row.vendor_name ?? "Unknown",
          testCaseId: row.test_case_id ?? "Unknown",
          scenario: row.scenario ?? "Unknown",
          functionalArea: row.functional_area ?? "Unknown",
          status: row.status,
          severity: row.severity,
          grade: row.grade,
          usabilityRating: row.usability_rating,
          improvementNeeded: row.improvement_needed,
          configurationRequired: row.configuration_required,
          vendorAssistanceRequired: row.vendor_assistance_required,
          startedAt: row.started_at,
          completedAt: row.completed_at,
          updatedAt: row.updated_at,
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
