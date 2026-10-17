import "server-only";
import { withTransaction } from "@/lib/db/pool";
import { AppError } from "@/lib/actionResult";
import type { ComparisonInput } from "@/lib/validation/comparison";
import { isCompletedStatus } from "@/lib/constants";

export async function upsertComparison(testerId: string, input: ComparisonInput) {
  if (input.testerId !== testerId) {
    throw new AppError("FORBIDDEN", "You may only edit your own comparisons.");
  }
  return withTransaction(async (client) => {
    const { rows: assignments } = await client.query<{ slug: string; status: string | null }>(
      `select v.slug, tr.status from assignments a
       join vendors v on v.id = a.vendor_id
       left join test_results tr on tr.assignment_id = a.id
       where a.tester_id = $1 and a.test_case_id = $2 and a.is_active = true
       for update of a`,
      [testerId, input.testCaseId],
    );
    const byVendor = new Map(assignments.map((row) => [row.slug, row.status]));
    if (!isCompletedStatus(byVendor.get("ironclad")) || !isCompletedStatus(byVendor.get("sirion"))) {
      throw new AppError("VALIDATION", "Both Ironclad and Sirion results must be complete before comparing.");
    }

    const { rows } = await client.query(
      `insert into comparisons (tester_id, test_case_id, preferred_vendor, comments)
       values ($1, $2, $3, $4)
       on conflict (tester_id, test_case_id) do update set
         preferred_vendor = excluded.preferred_vendor,
         comments = excluded.comments,
         version = comparisons.version + 1,
         updated_at = now()
       where comparisons.version = $5
       returning *`,
      [testerId, input.testCaseId, input.preferredVendor, input.comments ?? null, input.version],
    );
    if (!rows[0]) throw new AppError("CONFLICT", "This comparison was updated elsewhere. Reload to see the latest version.");
    return rows[0];
  });
}
