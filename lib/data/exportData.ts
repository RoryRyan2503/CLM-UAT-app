import "server-only";
import { query } from "@/lib/db/pool";
import type { ExportRecord } from "@/lib/export/buildWorkbook";

export async function getExportRecords(vendorSlug?: "ironclad" | "sirion"): Promise<ExportRecord[]> {
  type Joined = ExportRecord;
  const values = vendorSlug ? [vendorSlug] : [];
  const where = vendorSlug ? "where v.slug = $1" : "";
  const { rows } = await query<Joined>(
    `select to_jsonb(tc) as "testCase", to_jsonb(a) as assignment,
       to_jsonb(t) as tester, to_jsonb(v) as vendor, to_jsonb(tr) as result,
       to_jsonb(d) as defect
     from assignments a
     join testers t on t.id = a.tester_id
     join vendors v on v.id = a.vendor_id
     join test_cases tc on tc.id = a.test_case_id
     left join test_results tr on tr.assignment_id = a.id
     left join defects d on d.id = tr.defect_id
     ${where}
     order by tc.test_case_id`,
    values,
  );
  return rows;
}
