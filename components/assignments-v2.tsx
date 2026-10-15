"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { AlertCircle, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Search } from "lucide-react";
import { loadTestCaseWorkflowAction } from "@/app/actions/testCaseWorkflow";
import { TestResultForm } from "@/components/test-result-form";
import { ComparisonForm } from "@/components/comparison-form";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { isCompletedStatus, type VendorSlug } from "@/lib/constants";
import type { AssignmentListItem } from "@/lib/data/assignments";
import type { TestCaseWorkflow } from "@/lib/data/testCaseWorkflow";

const ALL = "__all__";

export function AssignmentsV2({ assignments, testerId }: { assignments: AssignmentListItem[]; testerId: string }) {
  const router = useRouter();
  const [vendor, setVendor] = useState<VendorSlug>("ironclad");
  const [search, setSearch] = useState("");
  const [area, setArea] = useState(ALL);
  const [statusFilter, setStatusFilter] = useState(ALL);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [workflow, setWorkflow] = useState<TestCaseWorkflow | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const areas = useMemo(() => Array.from(new Set(assignments.map((item) => item.functionalArea))).sort(), [assignments]);
  const filtered = assignments.filter((item) => {
    const status = vendor === "ironclad" ? item.ironcladStatus : item.sirionStatus;
    const matchesSearch = !search || item.testCaseId.toLowerCase().includes(search.toLowerCase()) || item.scenario.toLowerCase().includes(search.toLowerCase());
    return matchesSearch && (area === ALL || item.functionalArea === area) && (statusFilter === ALL || status === statusFilter);
  });
  const completed = assignments.filter((item) => isCompletedStatus(vendor === "ironclad" ? item.ironcladStatus : item.sirionStatus)).length;
  const ironcladCompleted = assignments.filter((item) => isCompletedStatus(item.ironcladStatus)).length;
  const sirionCompleted = assignments.filter((item) => isCompletedStatus(item.sirionStatus)).length;

  function expand(item: AssignmentListItem) {
    if (expandedId === item.testCaseUuid) {
      setExpandedId(null);
      setWorkflow(null);
      return;
    }
    setExpandedId(item.testCaseUuid);
    setWorkflow(null);
    setLoadingId(item.testCaseUuid);
    startTransition(async () => {
      const response = await loadTestCaseWorkflowAction(item.testCaseUuid);
      setLoadingId(null);
      if (!response.ok) {
        toast.error(response.error);
        setExpandedId(null);
        return;
      }
      setWorkflow(response.data);
    });
  }

  function navigateToOffset(offset: number) {
    const index = filtered.findIndex((item) => item.testCaseUuid === expandedId);
    const next = filtered[index + offset];
    if (next) expand(next);
  }

  async function refreshExpandedWorkflow(testCaseUuid: string) {
    const response = await loadTestCaseWorkflowAction(testCaseUuid);
    if (!response.ok) {
      toast.error(response.error);
      return;
    }
    setWorkflow(response.data);
    router.refresh();
  }

  const activeIndex = filtered.findIndex((item) => item.testCaseUuid === expandedId);

  return (
    <div className="flex flex-col gap-4">
      <section className="sticky top-0 z-20 -mx-4 flex flex-col gap-4 border-b border-border bg-surface/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:flex-row sm:items-end sm:justify-between sm:px-6 xl:-mx-10 xl:px-10">
        <div>
          <h1 className="text-xl font-semibold">Assignments workspace</h1>
          <p className="mt-1 text-sm text-foreground-muted">Currently evaluating <strong className="text-foreground">{vendor === "ironclad" ? "Ironclad" : "Sirion"}</strong> · {completed} of {assignments.length} cases complete</p>
          <Progress value={assignments.length ? (completed / assignments.length) * 100 : 0} className="mt-3 max-w-md" />
        </div>
        <div aria-label="Choose the vendor you are evaluating" className="grid w-full grid-cols-2 gap-1 rounded-md border border-border bg-background p-1 sm:w-auto" role="group">
          <button type="button" aria-pressed={vendor === "ironclad"} onClick={() => setVendor("ironclad")} className={`flex min-w-36 flex-col items-start rounded px-4 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${vendor === "ironclad" ? "bg-primary text-primary-foreground" : "hover:bg-surface-muted"}`}><span className="text-sm font-semibold">Ironclad</span><span className={`text-xs ${vendor === "ironclad" ? "text-white/85" : "text-foreground-muted"}`}>{ironcladCompleted}/{assignments.length} complete</span></button>
          <button type="button" aria-pressed={vendor === "sirion"} onClick={() => setVendor("sirion")} className={`flex min-w-36 flex-col items-start rounded px-4 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${vendor === "sirion" ? "bg-primary text-primary-foreground" : "hover:bg-surface-muted"}`}><span className="text-sm font-semibold">Sirion</span><span className={`text-xs ${vendor === "sirion" ? "text-white/85" : "text-foreground-muted"}`}>{sirionCompleted}/{assignments.length} complete</span></button>
        </div>
      </section>

      <div className="flex flex-col gap-3 lg:flex-row">
        <div className="relative min-w-56 flex-1">
          <Search aria-hidden="true" className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-foreground-muted" />
          <Input aria-label="Search assigned tests" className="pl-9" placeholder="Search ID or scenario" value={search} onChange={(event) => setSearch(event.target.value)} />
        </div>
        <select aria-label="Filter by functional area" className="h-10 rounded-md border border-border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" value={area} onChange={(event) => setArea(event.target.value)}>
          <option value={ALL}>All functional areas</option>
          {areas.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <select aria-label="Filter by status" className="h-10 rounded-md border border-border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
          <option value={ALL}>All statuses</option>
          {["Not Started", "In Progress", "Pass", "Pass with Observation", "Fail", "Blocked", "Not Applicable", "Retest Required"].map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
      </div>

      <div className="overflow-hidden rounded-md border border-border bg-background">
        <Table className="w-full min-w-[1000px] table-fixed">
          <TableHeader><TableRow><TableHead className="w-[5%]">Open</TableHead><TableHead className="w-[10%]">Test Case ID</TableHead><TableHead className="w-[14%]">Functional Area</TableHead><TableHead className="w-[38%]">Scenario</TableHead><TableHead className="w-[13%]">{vendor === "ironclad" ? "Ironclad status" : "Sirion status"}</TableHead><TableHead className="w-[20%]">Comparison / preference</TableHead></TableRow></TableHeader>
          <TableBody>
            {filtered.map((item, index) => {
              const status = vendor === "ironclad" ? item.ironcladStatus : item.sirionStatus;
              const isOpen = expandedId === item.testCaseUuid;
              return <FragmentRow key={item.testCaseUuid} item={item} vendor={vendor} status={status} isOpen={isOpen} loading={loadingId === item.testCaseUuid || (isPending && loadingId === item.testCaseUuid)} workflow={isOpen ? workflow : null} testerId={testerId} onToggle={() => expand(item)} onPrevious={() => navigateToOffset(-1)} onNext={() => navigateToOffset(1)} onSaved={() => refreshExpandedWorkflow(item.testCaseUuid)} canGoPrevious={index > 0} canGoNext={index < filtered.length - 1} position={index + 1} total={filtered.length} />;
            })}
            {filtered.length === 0 ? <TableRow><TableCell colSpan={6} className="py-12 text-center text-sm text-foreground-muted">No assigned tests match these filters.</TableCell></TableRow> : null}
          </TableBody>
        </Table>
      </div>
      <p className="text-xs text-foreground-muted">Select a row to expand its test definition and evaluation form without leaving this page.</p>
      <span className="sr-only" aria-live="polite">{activeIndex >= 0 ? `Test ${activeIndex + 1} of ${filtered.length} expanded` : "No test expanded"}</span>
    </div>
  );
}

function FragmentRow({ item, vendor, status, isOpen, loading, workflow, testerId, onToggle, onPrevious, onNext, onSaved, canGoPrevious, canGoNext, position, total }: {
  item: AssignmentListItem; vendor: VendorSlug; status: string; isOpen: boolean; loading: boolean; workflow: TestCaseWorkflow | null; testerId: string;
  onToggle: () => void; onPrevious: () => void; onNext: () => void; onSaved: () => void; canGoPrevious: boolean; canGoNext: boolean; position: number; total: number;
}) {
  const ironclad = workflow?.ironclad ?? null;
  const sirion = workflow?.sirion ?? null;
  const bothComplete = workflow ? isCompletedStatus(workflow.ironclad.result.status) && isCompletedStatus(workflow.sirion.result.status) : false;
  function handleRowKeyDown(event: React.KeyboardEvent<HTMLTableRowElement>) {
    if (event.target !== event.currentTarget) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onToggle();
    }
  }
  return (
    <>
      <TableRow
        className={`cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${isOpen ? "bg-surface" : undefined}`}
        tabIndex={0}
        aria-expanded={isOpen}
        onClick={onToggle}
        onKeyDown={handleRowKeyDown}
      >
        <TableCell><Button type="button" size="icon" variant="ghost" aria-label={`${isOpen ? "Collapse" : "Expand"} ${item.testCaseId}`} aria-expanded={isOpen} onClick={(event) => { event.stopPropagation(); onToggle(); }}>{isOpen ? <ChevronUp /> : <ChevronDown />}</Button></TableCell>
        <TableCell className="whitespace-nowrap font-semibold text-primary">{item.testCaseId}</TableCell>
        <TableCell className="whitespace-nowrap">{item.functionalArea}</TableCell>
        <TableCell className="max-w-0 truncate" title={item.scenario}>{item.scenario}</TableCell>
        <TableCell><StatusBadge status={status} /></TableCell>
        <TableCell>{item.preferredVendor ? <Badge variant={item.comparisonComplete ? "success" : "outline"}>{item.preferredVendor}</Badge> : <span className="text-sm text-foreground-muted">{item.comparisonComplete ? "Equal / undecided" : "Pending"}</span>}</TableCell>
      </TableRow>
      {isOpen ? <TableRow className="hover:bg-background"><TableCell colSpan={6} className="bg-surface px-3 py-4 sm:px-6">
        {loading ? <div className="flex items-center gap-2 py-10 text-sm text-foreground-muted" role="status"><span className="size-4 animate-spin rounded-full border-2 border-border border-t-primary" />Loading evaluation…</div> : workflow && ironclad && sirion ? (
          <div className="mx-auto flex w-full flex-col gap-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><p className="mb-1 text-xs font-semibold uppercase text-foreground-muted">Currently editing <span className="text-primary">{vendor === "ironclad" ? "Ironclad" : "Sirion"}</span></p><h2 className="text-base font-semibold">{workflow.testCase.test_case_id}: {workflow.testCase.scenario}</h2><p className="mt-1 text-sm text-foreground-muted">{workflow.testCase.functional_area}{workflow.testCase.persona ? ` · ${workflow.testCase.persona}` : ""}</p></div>
              <div className="flex items-center gap-2"><Button type="button" variant="outline" size="sm" onClick={onPrevious} disabled={!canGoPrevious} aria-label="Previous test case"><ChevronLeft />Previous</Button><span className="min-w-16 text-center text-xs text-foreground-muted">{position} / {total}</span><Button type="button" variant="outline" size="sm" onClick={onNext} disabled={!canGoNext} aria-label="Next test case">Next<ChevronRight /></Button></div>
            </div>
            <details className="rounded-md border border-border bg-background"><summary className="cursor-pointer px-4 py-3 text-sm font-medium">Test definition and suggested steps</summary><div className="grid gap-4 border-t border-border p-4 text-sm"><Definition label="Suggested Steps" value={workflow.testCase.suggested_steps} /><Definition label="Expected Result" value={workflow.testCase.expected_result} /><Definition label="Required Evidence" value={workflow.testCase.required_evidence} /></div></details>
              <div hidden={vendor !== "ironclad"}>
                <TestResultForm key={ironclad.result.id} vendorName={ironclad.vendorName} assignmentId={ironclad.assignment.id} vendorId={ironclad.assignment.vendor_id} result={ironclad.result} evidence={ironclad.evidence} onSaved={onSaved} />
              </div>
              <div hidden={vendor !== "sirion"}>
                <TestResultForm key={sirion.result.id} vendorName={sirion.vendorName} assignmentId={sirion.assignment.id} vendorId={sirion.assignment.vendor_id} result={sirion.result} evidence={sirion.evidence} onSaved={onSaved} />
              </div>
            {bothComplete ? <ComparisonForm testerId={testerId} testCaseId={workflow.testCase.id} ironclad={workflow.ironclad} sirion={workflow.sirion} comparison={workflow.comparison} /> : <div className="flex items-center gap-2 text-xs text-foreground-muted"><AlertCircle className="size-4" />Complete both vendors to record a comparison and preference.</div>}
          </div>
        ) : <p className="py-8 text-sm text-critical">Could not load this evaluation. Collapse the row and try again.</p>}
      </TableCell></TableRow> : null}
    </>
  );
}

function Definition({ label, value }: { label: string; value: string }) {
  return <div><h3 className="text-xs font-semibold uppercase text-foreground-muted">{label}</h3><p className="mt-1 whitespace-pre-wrap">{value || "—"}</p></div>;
}
