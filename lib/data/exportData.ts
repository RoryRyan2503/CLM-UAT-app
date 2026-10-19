import "server-only";
import { query } from "@/lib/db/pool";
import type { ExportRecord } from "@/lib/export/buildWorkbook";

export async function getExportRecords(vendorSlug?: "ironclad" | "sirion"): Promise<ExportRecord[]> {
  type Joined = ExportRecord;
  const values = vendorSlug ? [vendorSlug] : [];
  const where = vendorSlug ? "where v.slug = $1" : "";
  /* SECURITY_NOTE: Allowlist tester/evidence metadata; do not load access hashes, URLs, or storage paths. */
  const { rows } = await query<Joined>(
    `select to_jsonb(tc) as "testCase", to_jsonb(a) as assignment,
       jsonb_build_object(
         'id', t.id, 'name', t.name, 'email', t.email, 'department', t.department,
         'persona', t.persona, 'persona_id', t.persona_id, 'is_active', t.is_active,
         'created_at', t.created_at, 'updated_at', t.updated_at
       ) as tester,
       to_jsonb(v) as vendor, to_jsonb(tr) as result, to_jsonb(d) as defect,
       coalesce((
         select jsonb_agg(jsonb_build_object(
           'id', e.id, 'test_result_id', e.test_result_id, 'kind', e.kind,
           'file_name', e.file_name, 'mime_type', e.mime_type, 'size_bytes', e.size_bytes,
           'created_at', e.created_at, 'created_by_tester_id', e.created_by_tester_id
         ) order by e.created_at, e.id)
         from evidence e where e.test_result_id = tr.id
       ), '[]'::jsonb) as evidence
     from assignments a
     join testers t on t.id = a.tester_id
     join vendors v on v.id = a.vendor_id
     join test_cases tc on tc.id = a.test_case_id
     left join test_results tr on tr.assignment_id = a.id
     left join defects d on d.id = tr.defect_id
       and d.test_result_id = tr.id and d.vendor_id = v.id
     ${where}
     order by tc.test_case_id, t.id, v.slug, a.id`,
    values,
  );
  return rows;
}
