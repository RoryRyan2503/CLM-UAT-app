import Link from "next/link";
import { requireTesterSession } from "@/lib/auth/testerSession";
import { getDashboardSummary } from "@/lib/data/dashboard";
import { ProgressStatCard } from "@/components/progress-stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default async function DashboardPage() {
  const tester = await requireTesterSession();
  const summary = await getDashboardSummary(tester.id);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Welcome back, {tester.name.split(" ")[0]}</h1>
          <p className="text-sm text-foreground-muted">Here&apos;s your testing progress across both vendors.</p>
        </div>
        <Button asChild>
          <Link href="/assignments-v2">Go to assignments</Link>
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <ProgressStatCard title="Ironclad" completed={summary.ironcladCompleted} total={summary.ironcladTotal} />
        <ProgressStatCard title="Sirion" completed={summary.sirionCompleted} total={summary.sirionTotal} />
        <ProgressStatCard title="Overall progress" completed={summary.overallCompleted} total={summary.overallTotal} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Result breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="Passed" value={summary.passed} />
            <Stat label="Failed" value={summary.failed} />
            <Stat label="Blocked" value={summary.blocked} />
            <Stat label="Incomplete" value={summary.incomplete} />
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border bg-surface p-4">
      <dt className="text-xs font-medium uppercase tracking-wide text-foreground-muted">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold">{value}</dd>
    </div>
  );
}
