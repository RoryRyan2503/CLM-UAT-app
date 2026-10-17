import "server-only";
import { query } from "@/lib/db/pool";
import { isCompletedStatus } from "@/lib/constants";

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
  const { rows } = await query<{
    tester_id: string; tester_name: string | null; vendor_slug: string; vendor_name: string;
    functional_area: string | null; status: string | null;
  }>(
    `select a.tester_id, t.name as tester_name, v.slug as vendor_slug, v.name as vendor_name,
       tc.functional_area, tr.status
     from assignments a join testers t on t.id = a.tester_id
     join vendors v on v.id = a.vendor_id
     join test_cases tc on tc.id = a.test_case_id
     left join test_results tr on tr.assignment_id = a.id
     where a.is_active = true`,
  );

  const byTester = new Map<string, TesterProgressRow>();
  const byVendor = new Map<string, VendorProgressRow>();
  const byArea = new Map<string, FunctionalAreaProgressRow>();

  for (const row of rows) {
    const completed = isCompletedStatus(row.status);
    const vendorSlug = row.vendor_slug;

    const tester = byTester.get(row.tester_id) ?? {
      testerId: row.tester_id,
      testerName: row.tester_name ?? "Unknown",
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
      vendorName: row.vendor_name,
      completed: 0,
      total: 0,
    };
    vendor.total += 1;
    if (completed) vendor.completed += 1;
    byVendor.set(vendorSlug, vendor);

    const area = row.functional_area ?? "Unknown";
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
