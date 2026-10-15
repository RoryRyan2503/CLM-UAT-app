import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/adminClient";
import { AppError } from "@/lib/actionResult";
import { COMPLETED_STATUSES, PASSING_STATUSES } from "@/lib/constants";
import { embeddedOne } from "@/lib/supabase/embedded";

export interface DashboardSummary {
  ironcladCompleted: number;
  ironcladTotal: number;
  sirionCompleted: number;
  sirionTotal: number;
  overallCompleted: number;
  overallTotal: number;
  passed: number;
  failed: number;
  blocked: number;
  incomplete: number;
}

export async function getDashboardSummary(testerId: string): Promise<DashboardSummary> {
  const supabase = createSupabaseAdminClient();

  const { data, error } = await supabase
    .from("assignments")
    .select("vendor_id, vendors(slug), test_results(status)")
    .eq("tester_id", testerId)
    .eq("is_active", true);

  if (error) throw new AppError("NOT_FOUND", "Unable to load dashboard.");

  type Row = {
    vendor_id: string;
    vendors: { slug: string } | null;
    test_results: { status: string } | { status: string }[] | null;
  };
  const rows = (data ?? []) as unknown as Row[];

  const summary: DashboardSummary = {
    ironcladCompleted: 0,
    ironcladTotal: 0,
    sirionCompleted: 0,
    sirionTotal: 0,
    overallCompleted: 0,
    overallTotal: 0,
    passed: 0,
    failed: 0,
    blocked: 0,
    incomplete: 0,
  };

  for (const row of rows) {
    const status = embeddedOne(row.test_results)?.status ?? "Not Started";
    const completed = COMPLETED_STATUSES.includes(status as (typeof COMPLETED_STATUSES)[number]);
    const slug = row.vendors?.slug;

    summary.overallTotal += 1;
    if (completed) summary.overallCompleted += 1;

    if (slug === "ironclad") {
      summary.ironcladTotal += 1;
      if (completed) summary.ironcladCompleted += 1;
    } else if (slug === "sirion") {
      summary.sirionTotal += 1;
      if (completed) summary.sirionCompleted += 1;
    }

    if (PASSING_STATUSES.includes(status as (typeof PASSING_STATUSES)[number])) summary.passed += 1;
    else if (status === "Fail") summary.failed += 1;
    else if (status === "Blocked") summary.blocked += 1;
    else if (!completed) summary.incomplete += 1;
  }

  return summary;
}
