import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/adminClient";
import { AppError } from "@/lib/actionResult";
import type { ComparisonInput } from "@/lib/validation/comparison";
import { isCompletedStatus } from "@/lib/constants";
import { embeddedOne } from "@/lib/supabase/embedded";

export async function upsertComparison(testerId: string, input: ComparisonInput) {
  if (input.testerId !== testerId) {
    throw new AppError("FORBIDDEN", "You may only edit your own comparisons.");
  }
  const supabase = createSupabaseAdminClient();

  const { data: assignments } = await supabase
    .from("assignments")
    .select("vendors(slug), test_results(status)")
    .eq("tester_id", testerId)
    .eq("test_case_id", input.testCaseId)
    .eq("is_active", true);

  type Row = {
    vendors: { slug: string } | null;
    test_results: { status: string } | { status: string }[] | null;
  };
  const byVendor = new Map(
    (assignments as unknown as Row[] | null)?.map((row) => [
      row.vendors?.slug,
      embeddedOne(row.test_results)?.status,
    ]) ?? [],
  );
  const ironcladDone = isCompletedStatus(byVendor.get("ironclad"));
  const sirionDone = isCompletedStatus(byVendor.get("sirion"));
  if (!ironcladDone || !sirionDone) {
    throw new AppError("VALIDATION", "Both Ironclad and Sirion results must be complete before comparing.");
  }

  const { data: existing } = await supabase
    .from("comparisons")
    .select("id, version")
    .eq("tester_id", testerId)
    .eq("test_case_id", input.testCaseId)
    .maybeSingle();

  if (!existing) {
    const { data: created, error } = await supabase
      .from("comparisons")
      .insert({
        tester_id: testerId,
        test_case_id: input.testCaseId,
        preferred_vendor: input.preferredVendor,
        comments: input.comments ?? null,
      })
      .select("*")
      .maybeSingle();
    if (error || !created) throw new AppError("VALIDATION", "Unable to save comparison.");
    return created;
  }

  if (existing.version !== input.version) {
    throw new AppError("CONFLICT", "This comparison was updated elsewhere. Reload to see the latest version.");
  }

  const { data: updated, error } = await supabase
    .from("comparisons")
    .update({
      preferred_vendor: input.preferredVendor,
      comments: input.comments ?? null,
      version: existing.version + 1,
    })
    .eq("id", existing.id)
    .eq("version", existing.version)
    .select("*")
    .maybeSingle();

  if (error || !updated) throw new AppError("CONFLICT", "This comparison was updated elsewhere.");
  return updated;
}
