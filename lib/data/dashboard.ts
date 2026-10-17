import "server-only";
import { query } from "@/lib/db/pool";
import { AppError } from "@/lib/actionResult";
import { COMPLETED_STATUSES, PASSING_STATUSES } from "@/lib/constants";

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
  const completedValues = COMPLETED_STATUSES.map((_, index) => `$${index + 2}`).join(", ");
  const passingValues = PASSING_STATUSES.map((_, index) => `$${index + COMPLETED_STATUSES.length + 2}`).join(", ");
  const values = [testerId, ...COMPLETED_STATUSES, ...PASSING_STATUSES];
  try {
    const { rows } = await query<Record<keyof DashboardSummary, string>>(
      `select
         count(*) filter (where v.slug = 'ironclad' and coalesce(tr.status, 'Not Started') in (${completedValues})) as "ironcladCompleted",
         count(*) filter (where v.slug = 'ironclad') as "ironcladTotal",
         count(*) filter (where v.slug = 'sirion' and coalesce(tr.status, 'Not Started') in (${completedValues})) as "sirionCompleted",
         count(*) filter (where v.slug = 'sirion') as "sirionTotal",
         count(*) filter (where coalesce(tr.status, 'Not Started') in (${completedValues})) as "overallCompleted",
         count(*) as "overallTotal",
         count(*) filter (where tr.status in (${passingValues})) as passed,
         count(*) filter (where tr.status = 'Fail') as failed,
         count(*) filter (where tr.status = 'Blocked') as blocked,
         count(*) filter (where coalesce(tr.status, 'Not Started') not in (${completedValues})) as incomplete
       from assignments a join vendors v on v.id = a.vendor_id
       left join test_results tr on tr.assignment_id = a.id
       where a.tester_id = $1 and a.is_active = true`,
      values,
    );
    const result = rows[0];
    return {
      ironcladCompleted: Number(result.ironcladCompleted),
      ironcladTotal: Number(result.ironcladTotal),
      sirionCompleted: Number(result.sirionCompleted),
      sirionTotal: Number(result.sirionTotal),
      overallCompleted: Number(result.overallCompleted),
      overallTotal: Number(result.overallTotal),
      passed: Number(result.passed),
      failed: Number(result.failed),
      blocked: Number(result.blocked),
      incomplete: Number(result.incomplete),
    };
  } catch {
    throw new AppError("NOT_FOUND", "Unable to load dashboard.");
  }
}
