import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/adminClient";
import { AppError } from "@/lib/actionResult";

export async function listAuditHistory(limit = 200) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("result_history")
    .select(
      "*, testers(name), test_results(assignment_id, assignments(vendors(name), test_cases(test_case_id)))",
    )
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new AppError("NOT_FOUND", "Unable to load audit history.");
  return data ?? [];
}
