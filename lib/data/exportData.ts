import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/adminClient";
import { AppError } from "@/lib/actionResult";
import type { ExportRecord } from "@/lib/export/buildWorkbook";
import { embeddedOne } from "@/lib/supabase/embedded";

export async function getExportRecords(vendorSlug?: "ironclad" | "sirion"): Promise<ExportRecord[]> {
  const supabase = createSupabaseAdminClient();

  let query = supabase
    .from("assignments")
    .select("*, testers(*), vendors(*), test_cases(*), test_results(*)")
    .order("test_case_id", { ascending: true });

  if (vendorSlug) {
    const { data: vendor } = await supabase.from("vendors").select("id").eq("slug", vendorSlug).maybeSingle();
    if (!vendor) throw new AppError("NOT_FOUND", "Unknown vendor.");
    query = query.eq("vendor_id", vendor.id);
  }

  const { data, error } = await query;
  if (error) throw new AppError("NOT_FOUND", "Unable to load export data.");

  type Row = {
    testers: ExportRecord["tester"];
    vendors: ExportRecord["vendor"];
    test_cases: ExportRecord["testCase"];
    test_results: ExportRecord["result"] | ExportRecord["result"][] | null;
  } & ExportRecord["assignment"];

  const records: ExportRecord[] = [];
  for (const row of (data ?? []) as unknown as Row[]) {
    const result = embeddedOne(row.test_results);
    let defect = null;
    if (result?.defect_id) {
      const { data: defectRow } = await supabase.from("defects").select("*").eq("id", result.defect_id).maybeSingle();
      defect = defectRow ?? null;
    }
    records.push({
      testCase: row.test_cases,
      tester: row.testers,
      vendor: row.vendors,
      result,
      defect,
      assignment: row as unknown as ExportRecord["assignment"],
    });
  }
  return records;
}
