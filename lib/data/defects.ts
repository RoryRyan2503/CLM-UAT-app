import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/adminClient";
import { AppError } from "@/lib/actionResult";

async function nextDefectCode(): Promise<string> {
  const supabase = createSupabaseAdminClient();
  const { count } = await supabase.from("defects").select("id", { count: "exact", head: true });
  const sequence = (count ?? 0) + 1;
  return `DEF-${String(sequence).padStart(4, "0")}`;
}

export async function createDefect(
  testerId: string,
  input: { testResultId: string; vendorId: string; title: string; description?: string; severity?: string },
) {
  const supabase = createSupabaseAdminClient();
  const { data: result } = await supabase
    .from("test_results")
    .select("id, assignments(tester_id, is_active)")
    .eq("id", input.testResultId)
    .maybeSingle();

  type Row = { assignments: { tester_id: string; is_active: boolean } | null };
  const assignment = (result as unknown as Row | null)?.assignments;
  if (!assignment || assignment.tester_id !== testerId || !assignment.is_active) {
    throw new AppError("FORBIDDEN", "You may only log defects for your own results.");
  }

  const defectCode = await nextDefectCode();
  const { data, error } = await supabase
    .from("defects")
    .insert({
      defect_code: defectCode,
      test_result_id: input.testResultId,
      vendor_id: input.vendorId,
      title: input.title,
      description: input.description ?? null,
      severity: input.severity ?? null,
      created_by_tester_id: testerId,
    })
    .select("*")
    .maybeSingle();

  if (error || !data) throw new AppError("VALIDATION", "Unable to create defect.");
  return data;
}

export async function listDefects() {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("defects")
    .select("*, vendors(name), test_results!defects_test_result_id_fkey(assignment_id, assignments(testers(name), test_cases(test_case_id)))")
    .order("created_at", { ascending: false });
  if (error) throw new AppError("NOT_FOUND", "Unable to load defects.");
  return data ?? [];
}

export async function updateDefectStatus(defectId: string, status: string) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("defects")
    .update({ status })
    .eq("id", defectId)
    .select("*")
    .maybeSingle();
  if (error || !data) throw new AppError("VALIDATION", "Unable to update defect.");
  return data;
}
