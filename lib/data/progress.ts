import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/adminClient";
import { AppError } from "@/lib/actionResult";
import { isCompletedStatus } from "@/lib/constants";
import { embeddedOne } from "@/lib/supabase/embedded";

export interface TesterProgressRow {
  testerId: string;
  testerName: string;
  completed: number;
  total: number;
  ironcladCompleted: number;
  ironcladTotal: number;
  sirionCompleted: number;
  sirionTotal: number;
}

export interface FunctionalAreaProgressRow {
  functionalArea: string;
  completed: number;
  total: number;
}

export interface VendorProgressRow {
  vendorSlug: string;
  vendorName: string;
  completed: number;
  total: number;
}

export async function getProgressOverview() {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("assignments")
    .select("tester_id, testers(name), vendor_id, vendors(slug, name), test_case_id, test_cases(functional_area), test_results(status)")
    .eq("is_active", true);
  if (error) throw new AppError("NOT_FOUND", "Unable to load progress.");

  type Row = {
    tester_id: string;
    testers: { name: string } | null;
    vendor_id: string;
    vendors: { slug: string; name: string } | null;
    test_case_id: string;
    test_cases: { functional_area: string } | null;
    test_results: { status: string } | { status: string }[] | null;
  };
  const rows = (data ?? []) as unknown as Row[];

  const byTester = new Map<string, TesterProgressRow>();
  const byVendor = new Map<string, VendorProgressRow>();
  const byArea = new Map<string, FunctionalAreaProgressRow>();

  for (const row of rows) {
    const completed = isCompletedStatus(embeddedOne(row.test_results)?.status);
    const vendorSlug = row.vendors?.slug ?? "unknown";

    const tester = byTester.get(row.tester_id) ?? {
      testerId: row.tester_id,
      testerName: row.testers?.name ?? "Unknown",
      completed: 0,
      total: 0,
      ironcladCompleted: 0,
      ironcladTotal: 0,
      sirionCompleted: 0,
      sirionTotal: 0,
    };
    tester.total += 1;
    if (completed) tester.completed += 1;
    if (vendorSlug === "ironclad") {
      tester.ironcladTotal += 1;
      if (completed) tester.ironcladCompleted += 1;
    } else if (vendorSlug === "sirion") {
      tester.sirionTotal += 1;
      if (completed) tester.sirionCompleted += 1;
    }
    byTester.set(row.tester_id, tester);

    const vendor = byVendor.get(vendorSlug) ?? {
      vendorSlug,
      vendorName: row.vendors?.name ?? "Unknown",
      completed: 0,
      total: 0,
    };
    vendor.total += 1;
    if (completed) vendor.completed += 1;
    byVendor.set(vendorSlug, vendor);

    const area = row.test_cases?.functional_area ?? "Unknown";
    const areaRow = byArea.get(area) ?? { functionalArea: area, completed: 0, total: 0 };
    areaRow.total += 1;
    if (completed) areaRow.completed += 1;
    byArea.set(area, areaRow);
  }

  return {
    byTester: Array.from(byTester.values()).sort((a, b) => a.testerName.localeCompare(b.testerName)),
    byVendor: Array.from(byVendor.values()).sort((a, b) => a.vendorName.localeCompare(b.vendorName)),
    byFunctionalArea: Array.from(byArea.values()).sort((a, b) => a.functionalArea.localeCompare(b.functionalArea)),
  };
}
