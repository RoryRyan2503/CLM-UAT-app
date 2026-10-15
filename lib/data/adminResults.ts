import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/adminClient";
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
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("test_results")
    .select(
      "id, status, severity, grade, assignments(testers(name), vendors(name), test_cases(test_case_id, functional_area)), evidence(id, kind, file_name, url)",
    );
  if (error) throw new AppError("NOT_FOUND", "Unable to load results.");

  type Row = {
    id: string;
    status: string;
    severity: string | null;
    grade: string | null;
    assignments: {
      testers: { name: string } | null;
      vendors: { name: string } | null;
      test_cases: { test_case_id: string; functional_area: string } | null;
    } | null;
    evidence: { id: string; kind: string; file_name: string | null; url: string | null }[] | null;
  };

  return ((data ?? []) as unknown as Row[]).map((row) => ({
    resultId: row.id,
    testerName: row.assignments?.testers?.name ?? "Unknown",
    vendorName: row.assignments?.vendors?.name ?? "Unknown",
    testCaseId: row.assignments?.test_cases?.test_case_id ?? "Unknown",
    functionalArea: row.assignments?.test_cases?.functional_area ?? "Unknown",
    status: row.status,
    severity: row.severity,
    grade: row.grade,
    evidence: (row.evidence ?? []).map((e) => ({
      id: e.id,
      label: e.kind === "url" ? (e.url ?? "Link") : (e.file_name ?? "File"),
      kind: e.kind,
      url: e.url,
    })),
  }));
}
