"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { COMPLETED_STATUSES } from "@/lib/constants";

type Overview = Awaited<ReturnType<typeof import("@/lib/data/progress").getProgressOverview>>;

export function OverviewAnalytics({ overview, attentionEnabled }: { overview: Overview; attentionEnabled: boolean }) {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold">Progress overview</h1>
        <p className="mt-1 text-sm text-foreground-muted">Participation, results, vendor preferences, and cases that need attention.</p>
      </div>
      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="h-auto w-full justify-start overflow-x-auto">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="participation">Participation</TabsTrigger>
          <TabsTrigger value="outcomes">Outcomes & areas</TabsTrigger>
          <TabsTrigger value="comparison">Vendor comparison</TabsTrigger>
          {attentionEnabled ? <TabsTrigger value="attention">Attention ({overview.attention.length})</TabsTrigger> : null}
        </TabsList>
        <TabsContent value="overview"><OverviewTab overview={overview} /></TabsContent>
        <TabsContent value="participation"><ParticipationTab overview={overview} /></TabsContent>
        <TabsContent value="outcomes"><OutcomesTab overview={overview} /></TabsContent>
        <TabsContent value="comparison"><ComparisonTab overview={overview} /></TabsContent>
        {attentionEnabled ? <TabsContent value="attention"><AttentionTab overview={overview} /></TabsContent> : null}
      </Tabs>
    </div>
  );
}

function OverviewTab({ overview }: { overview: Overview }) {
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat title="Active testers" value={overview.participation.activeTesters} detail={`${overview.participation.unassignedTesters} not assigned`} />
        <Stat title="Started" value={overview.participation.startedTesters} detail="At least one result started" />
        <Stat title="Not started" value={overview.participation.notStartedTesters} detail="Assigned, no result started" />
        <Stat title="Completed all" value={overview.participation.completedAllTesters} detail="Of testers with assignments" />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Tool completion</CardTitle></CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {overview.byVendor.map((vendor) => <ProgressCard key={vendor.vendorSlug} title={vendor.vendorName} completed={vendor.completed} total={vendor.total} />)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Functional-area completion</CardTitle></CardHeader>
          <CardContent><AreaCompletionTable rows={overview.byFunctionalArea} /></CardContent>
        </Card>
      </div>
      <TesterProgressTable rows={overview.byTester} />
    </div>
  );
}

function ParticipationTab({ overview }: { overview: Overview }) {
  const p = overview.participation;
  const [testerSearch, setTesterSearch] = useState("");
  const [participationFilter, setParticipationFilter] = useState("all");
  const filteredTesters = useMemo(() => {
    const search = testerSearch.trim().toLowerCase();
    return p.testers.filter((tester) => {
      const matchesName = !search || tester.testerName.toLowerCase().includes(search);
      const matchesState = participationFilter === "all" || tester.state.toLowerCase() === participationFilter;
      return matchesName && matchesState;
    });
  }, [p.testers, testerSearch, participationFilter]);
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
        <Stat title="Active testers" value={p.activeTesters} />
        <Stat title="Started testing" value={p.startedTesters} detail="At least one started result" />
        <Stat title="Not started" value={p.notStartedTesters} detail="Have assignments" />
        <Stat title="Completed all" value={p.completedAllTesters} detail="All assigned results complete" />
        <Stat title="Unassigned" value={p.unassignedTesters} detail="No active assignments" />
      </div>
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <CardTitle className="text-base">Tester participation and workload</CardTitle>
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative min-w-56">
                <Search aria-hidden="true" className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-foreground-muted" />
                <Input aria-label="Search testers by name" placeholder="Search tester name" className="pl-9" value={testerSearch} onChange={(event) => setTesterSearch(event.target.value)} />
              </div>
              <select aria-label="Filter participation status" className="h-10 rounded-md border border-border bg-background px-3 text-sm" value={participationFilter} onChange={(event) => setParticipationFilter(event.target.value)}>
                <option value="all">All participation statuses</option>
                <option value="started">Started</option>
                <option value="not started">Not started</option>
                <option value="unassigned">Unassigned</option>
              </select>
            </div>
          </div>
          <p className="text-xs text-foreground-muted">Showing {filteredTesters.length} of {p.testers.length} active testers</p>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>Tester</TableHead><TableHead>Participation</TableHead><TableHead>Ironclad</TableHead><TableHead>Sirion</TableHead><TableHead>Completed</TableHead><TableHead>Overall</TableHead></TableRow></TableHeader>
            <TableBody>{filteredTesters.map((tester) => <TableRow key={tester.testerId}>
              <TableCell className="font-medium">{tester.testerName}</TableCell>
              <TableCell><StateLabel state={tester.state} /></TableCell>
              <TableCell>{tester.ironcladCompleted}/{tester.ironcladTotal}</TableCell>
              <TableCell>{tester.sirionCompleted}/{tester.sirionTotal}</TableCell>
              <TableCell>{tester.completed}/{tester.total}{tester.completedAll ? " · All" : ""}</TableCell>
              <TableCell className="min-w-40"><div className="flex items-center gap-2"><Progress value={percent(tester.completed, tester.total)} /><span className="whitespace-nowrap text-xs text-foreground-muted">{percent(tester.completed, tester.total)}%</span></div></TableCell>
            </TableRow>)}
              {filteredTesters.length === 0 ? <TableRow><TableCell colSpan={6} className="py-8 text-center text-sm text-foreground-muted">No testers match these filters.</TableCell></TableRow> : null}
            </TableBody>
          </Table>
          <p className="mt-3 text-xs text-foreground-muted">Started means a result has a start timestamp, including a saved draft. Completed uses the app’s completed statuses: {COMPLETED_STATUSES.join(", ")}.</p>
        </CardContent>
      </Card>
    </div>
  );
}

function OutcomesTab({ overview }: { overview: Overview }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Result status by tool</CardTitle></CardHeader>
          <CardContent><Table><TableHeader><TableRow><TableHead>Tool</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Results</TableHead></TableRow></TableHeader><TableBody>
            {overview.outcomesByVendor.flatMap((vendor) => vendor.counts.map((row) => <TableRow key={`${vendor.vendorSlug}-${row.status}`}><TableCell className="font-medium">{vendor.vendorSlug}</TableCell><TableCell>{row.status}</TableCell><TableCell className="text-right">{row.count}</TableCell></TableRow>))}
          </TableBody></Table></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Severity by tool</CardTitle></CardHeader>
          <CardContent><Table><TableHeader><TableRow><TableHead>Tool</TableHead><TableHead>Severity</TableHead><TableHead className="text-right">Results</TableHead></TableRow></TableHeader><TableBody>
            {overview.severitiesByVendor.flatMap((vendor) => vendor.counts.map((row) => <TableRow key={`${vendor.vendorSlug}-${row.severity}`}><TableCell className="font-medium">{vendor.vendorSlug}</TableCell><TableCell>{row.severity}</TableCell><TableCell className="text-right">{row.count}</TableCell></TableRow>))}
          </TableBody></Table></CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base">Grade distribution by tool and functional area</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Functional area</TableHead><TableHead>Tool</TableHead>{overview.definitions.gradeOrder.map((grade) => <TableHead key={grade} className="text-right">{grade}</TableHead>)}</TableRow></TableHeader><TableBody>
          {overview.grades.map((row) => <TableRow key={`${row.functionalArea}-${row.vendorSlug}`}><TableCell className="font-medium">{row.functionalArea}</TableCell><TableCell className="capitalize">{row.vendorSlug}</TableCell>{row.counts.map((item) => <TableCell key={item.grade} className="text-right">{item.count}</TableCell>)}</TableRow>)}
        </TableBody></Table><p className="mt-3 text-xs text-foreground-muted">Missing is reported separately. Letter grades are shown as counts, not averaged.</p></CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">Functional-area heatmap</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Functional area</TableHead><TableHead>Tool</TableHead><TableHead>Complete</TableHead><TableHead>Not started</TableHead><TableHead>In progress</TableHead><TableHead>Pass</TableHead><TableHead>Fail</TableHead><TableHead>Blocked</TableHead><TableHead>Retest</TableHead></TableRow></TableHeader><TableBody>
          {overview.heatmap.map((cell) => <TableRow key={`${cell.functionalArea}-${cell.vendorSlug}`}><TableCell className="font-medium">{cell.functionalArea}</TableCell><TableCell>{cell.vendorName}</TableCell><TableCell>{cell.completed}/{cell.total}</TableCell><TableCell>{cell.notStarted}</TableCell><TableCell>{cell.inProgress}</TableCell><TableCell className="text-emerald-700">{cell.passing}</TableCell><TableCell className="text-red-700">{cell.failed}</TableCell><TableCell className="text-amber-700">{cell.blocked}</TableCell><TableCell>{cell.retest}</TableCell></TableRow>)}
        </TableBody></Table></CardContent>
      </Card>
    </div>
  );
}

function ComparisonTab({ overview }: { overview: Overview }) {
  const grades = overview.vendorComparison.pairedGrades;
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat title="Prefer Ironclad" value={preferenceCount(overview, "Ironclad")} />
        <Stat title="Prefer Sirion" value={preferenceCount(overview, "Sirion")} />
        <Stat title="Equal" value={preferenceCount(overview, "Equal")} />
        <Stat title="Unable to decide" value={preferenceCount(overview, "Unable to Decide")} />
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base">Paired grade comparison</CardTitle></CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Stat title="Ironclad higher" value={grades.ironcladHigher} detail="Paired completed grades" />
            <Stat title="Sirion higher" value={grades.sirionHigher} detail="Paired completed grades" />
            <Stat title="Same grade" value={grades.same} detail="Paired completed grades" />
            <Stat title="Not comparable" value={grades.unavailable} detail="Missing grade or N/A" />
          </div>
          <p className="mt-4 text-xs text-foreground-muted">Grade ordering: A, B, C, D, F. N/A and missing grades are excluded from higher/lower comparisons. Preferences come from tester-submitted comparisons.</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">Recorded preference counts</CardTitle></CardHeader>
        <CardContent><Table><TableHeader><TableRow><TableHead>Preference</TableHead><TableHead className="text-right">Comparisons</TableHead></TableRow></TableHeader><TableBody>
          {overview.vendorComparison.preferences.map((item) => <TableRow key={item.preferredVendor}><TableCell className="font-medium">{item.preferredVendor}</TableCell><TableCell className="text-right">{item.count}</TableCell></TableRow>)}
          {overview.vendorComparison.preferences.length === 0 ? <TableRow><TableCell colSpan={2} className="py-8 text-center text-sm text-foreground-muted">No comparisons submitted yet.</TableCell></TableRow> : null}
        </TableBody></Table></CardContent>
      </Card>
    </div>
  );
}

function AttentionTab({ overview }: { overview: Overview }) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Results that may need follow-up</CardTitle></CardHeader>
      <CardContent className="overflow-x-auto">
        <Table><TableHeader><TableRow><TableHead>Case</TableHead><TableHead>Scenario</TableHead><TableHead>Area</TableHead><TableHead>Tool</TableHead><TableHead>Tester</TableHead><TableHead>Status</TableHead><TableHead>Grade</TableHead><TableHead>Signals</TableHead></TableRow></TableHeader><TableBody>
          {overview.attention.map((item, index) => <TableRow key={`${item.testCaseId}-${item.vendorName}-${item.testerName}-${index}`}><TableCell className="font-medium">{item.testCaseId}</TableCell><TableCell className="max-w-xs truncate" title={item.scenario}>{item.scenario}</TableCell><TableCell>{item.functionalArea}</TableCell><TableCell>{item.vendorName}</TableCell><TableCell>{item.testerName}</TableCell><TableCell>{item.status}</TableCell><TableCell>{item.grade ?? "Missing"}</TableCell><TableCell className="max-w-sm"><div className="flex flex-wrap gap-1">{item.reasons.map((reason) => <span key={reason} className="rounded-sm border border-border px-2 py-0.5 text-xs">{reason}</span>)}</div></TableCell></TableRow>)}
          {overview.attention.length === 0 ? <TableRow><TableCell colSpan={8} className="py-10 text-center text-sm text-foreground-muted">No results currently match the attention signals.</TableCell></TableRow> : null}
        </TableBody></Table>
        <p className="mt-3 text-xs text-foreground-muted">Signals include critical/high-severity failures, blocked or retest cases, improvement requests, low usability ratings, configuration/vendor assistance requests, and unresolved defects.</p>
      </CardContent>
    </Card>
  );
}

function TesterProgressTable({ rows }: { rows: Overview["byTester"] }) {
  return <Card><CardHeader><CardTitle className="text-base">By tester</CardTitle></CardHeader><CardContent><Table><TableHeader><TableRow><TableHead>Tester</TableHead><TableHead>Ironclad</TableHead><TableHead>Sirion</TableHead><TableHead>Overall progress</TableHead></TableRow></TableHeader><TableBody>
    {rows.map((tester) => <TableRow key={tester.testerId}><TableCell className="font-medium">{tester.testerName}</TableCell><TableCell>{tester.ironcladCompleted}/{tester.ironcladTotal} complete</TableCell><TableCell>{tester.sirionCompleted}/{tester.sirionTotal} complete</TableCell><TableCell className="min-w-52"><div className="flex items-center gap-3"><Progress value={percent(tester.completed, tester.total)} /><span className="whitespace-nowrap text-xs text-foreground-muted">{tester.completed}/{tester.total}</span></div></TableCell></TableRow>)}
  </TableBody></Table></CardContent></Card>;
}

function AreaCompletionTable({ rows }: { rows: Overview["byFunctionalArea"] }) {
  return <Table><TableHeader><TableRow><TableHead>Functional area</TableHead><TableHead>Progress</TableHead><TableHead className="text-right">Complete</TableHead></TableRow></TableHeader><TableBody>
    {rows.map((row) => <TableRow key={row.functionalArea}><TableCell className="font-medium">{row.functionalArea}</TableCell><TableCell><Progress value={percent(row.completed, row.total)} /></TableCell><TableCell className="text-right">{row.completed}/{row.total}</TableCell></TableRow>)}
    {rows.length === 0 ? <TableRow><TableCell colSpan={3} className="py-6 text-center text-sm text-foreground-muted">No active assignments.</TableCell></TableRow> : null}
  </TableBody></Table>;
}

function ProgressCard({ title, completed, total }: { title: string; completed: number; total: number }) {
  return <div className="flex flex-col gap-2 rounded-md border border-border p-3"><div className="flex justify-between gap-2 text-sm"><span className="font-medium">{title}</span><span className="text-foreground-muted">{completed}/{total}</span></div><Progress value={percent(completed, total)} /><span className="text-xs text-foreground-muted">{percent(completed, total)}% complete</span></div>;
}

function Stat({ title, value, detail }: { title: string; value: string | number; detail?: string }) {
  return <Card><CardContent className="p-4"><p className="text-sm text-foreground-muted">{title}</p><p className="mt-1 text-2xl font-semibold">{value}</p>{detail ? <p className="mt-1 text-xs text-foreground-muted">{detail}</p> : null}</CardContent></Card>;
}

function StateLabel({ state }: { state: "Unassigned" | "Started" | "Not started" }) {
  const className = state === "Started" ? "border-emerald-300 text-emerald-800" : state === "Not started" ? "border-amber-300 text-amber-800" : "border-border text-foreground-muted";
  return <span className={`rounded-sm border px-2 py-1 text-xs ${className}`}>{state}</span>;
}

function preferenceCount(overview: Overview, preferredVendor: string) {
  return overview.vendorComparison.preferences.find((row) => row.preferredVendor === preferredVendor)?.count ?? 0;
}

function percent(completed: number, total: number) {
  return total ? Math.round(completed / total * 100) : 0;
}