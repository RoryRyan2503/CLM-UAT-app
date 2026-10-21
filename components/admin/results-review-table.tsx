"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/status-badge";
import { SeverityBadge } from "@/components/severity-badge";
import { getAdminSignedEvidenceUrlAction } from "@/app/actions/admin/evidence";
import type { AdminResultRow } from "@/lib/data/adminResults";

const ALL = "__all__";
const MISSING = "__missing__";
type SortKey = "testerName" | "vendorName" | "testCaseId" | "scenario" | "functionalArea" | "status" | "severity" | "grade" | "usabilityRating" | "startedAt" | "completedAt" | "updatedAt";
type SortState = { key: SortKey; direction: "asc" | "desc" };

export function ResultsReviewTable({ results }: { results: AdminResultRow[] }) {
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState({
    tester: ALL, vendor: ALL, testCase: ALL, scenario: ALL, area: ALL, persona: ALL,
    status: ALL, grade: ALL, severity: ALL, improvement: ALL, configuration: ALL, assistance: ALL,
  });
  const [sort, setSort] = useState<SortState>({ key: "updatedAt", direction: "desc" });

  const choices = useMemo(() => ({
    testers: unique(results.map((row) => row.testerName)),
    vendors: unique(results.map((row) => row.vendorName)),
    cases: unique(results.map((row) => row.testCaseId)),
    scenarios: unique(results.map((row) => row.scenario)),
    areas: unique(results.map((row) => row.functionalArea)),
    personas: unique(results.map((row) => row.testerPersona).filter((value): value is string => Boolean(value))),
    statuses: unique(results.map((row) => row.status)),
    grades: unique(results.map((row) => row.grade ?? MISSING)),
    severities: unique(results.map((row) => row.severity ?? MISSING)),
  }), [results]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const matching = results.filter((row) => {
      const matchesSearch = !q || [row.testerName, row.testerEmail ?? "", row.testerPersona ?? "", row.vendorName,
        row.testCaseId, row.scenario, row.functionalArea, row.status, row.grade ?? "", row.severity ?? ""]
        .some((value) => value.toLowerCase().includes(q));
      return matchesSearch &&
        matches(row.testerName, filters.tester) &&
        matches(row.vendorName, filters.vendor) &&
        matches(row.testCaseId, filters.testCase) &&
        matches(row.scenario, filters.scenario) &&
        matches(row.functionalArea, filters.area) &&
        matches(row.testerPersona, filters.persona) &&
        matches(row.status, filters.status) &&
        matches(row.grade, filters.grade, true) &&
        matches(row.severity, filters.severity, true) &&
        matchesBoolean(row.improvementNeeded, filters.improvement) &&
        matchesBoolean(row.configurationRequired, filters.configuration) &&
        matchesBoolean(row.vendorAssistanceRequired, filters.assistance);
    });
    return matching.sort((left, right) => compareRows(left, right, sort));
  }, [results, search, filters, sort]);

  function updateFilter(key: keyof typeof filters, value: string) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function changeSort(key: SortKey) {
    setSort((current) => current.key === key
      ? { key, direction: current.direction === "asc" ? "desc" : "asc" }
      : { key, direction: key === "updatedAt" || key === "completedAt" ? "desc" : "asc" });
  }

  async function handleViewEvidence(evidence: AdminResultRow["evidence"][number]) {
    if (evidence.kind === "url" && evidence.url) {
      window.open(evidence.url, "_blank", "noopener,noreferrer");
      return;
    }
    const res = await getAdminSignedEvidenceUrlAction(evidence.id);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    window.open(res.data, "_blank", "noopener,noreferrer");
  }

  const hasFilters = Object.values(filters).some((value) => value !== ALL) || Boolean(search);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 rounded-md border border-border bg-background p-4 sm:grid-cols-2 xl:grid-cols-4">
        <Input aria-label="Search results" placeholder="Search results" value={search} onChange={(event) => setSearch(event.target.value)} />
        <Filter label="Tester" value={filters.tester} values={choices.testers} onChange={(value) => updateFilter("tester", value)} />
        <Filter label="Tool" value={filters.vendor} values={choices.vendors} onChange={(value) => updateFilter("vendor", value)} />
        <Filter label="Test case" value={filters.testCase} values={choices.cases} onChange={(value) => updateFilter("testCase", value)} />
        <Filter label="Function / scenario" value={filters.scenario} values={choices.scenarios} onChange={(value) => updateFilter("scenario", value)} />
        <Filter label="Functional area" value={filters.area} values={choices.areas} onChange={(value) => updateFilter("area", value)} />
        <Filter label="Tester persona" value={filters.persona} values={choices.personas} onChange={(value) => updateFilter("persona", value)} />
        <Filter label="Status" value={filters.status} values={choices.statuses} onChange={(value) => updateFilter("status", value)} />
        <Filter label="Grade" value={filters.grade} values={choices.grades} onChange={(value) => updateFilter("grade", value)} missingLabel="Missing" />
        <Filter label="Severity" value={filters.severity} values={choices.severities} onChange={(value) => updateFilter("severity", value)} missingLabel="Missing" />
        <BooleanFilter label="Improvement needed" value={filters.improvement} onChange={(value) => updateFilter("improvement", value)} />
        <BooleanFilter label="Configuration required" value={filters.configuration} onChange={(value) => updateFilter("configuration", value)} />
        <BooleanFilter label="Vendor assistance" value={filters.assistance} onChange={(value) => updateFilter("assistance", value)} />
        <div className="flex items-center justify-between gap-3 text-sm text-foreground-muted sm:col-span-2 xl:col-span-3">
          <span>{filtered.length} of {results.length} results</span>
          <span>Sorted by {sortLabel(sort.key)} ({sort.direction})</span>
        </div>
        <Button type="button" variant="outline" onClick={() => { setSearch(""); setFilters({ tester: ALL, vendor: ALL, testCase: ALL, scenario: ALL, area: ALL, persona: ALL, status: ALL, grade: ALL, severity: ALL, improvement: ALL, configuration: ALL, assistance: ALL }); }} disabled={!hasFilters}>Reset filters</Button>
      </div>

      <div className="overflow-auto rounded-md border border-border bg-background">
        <Table className="min-w-[1500px]">
          <TableHeader><TableRow>
            <SortHead label="Tester" sortKey="testerName" sort={sort} onSort={changeSort} />
            <TableHead>Email / Persona</TableHead>
            <SortHead label="Tool" sortKey="vendorName" sort={sort} onSort={changeSort} />
            <SortHead label="Test case" sortKey="testCaseId" sort={sort} onSort={changeSort} />
            <SortHead label="Function / scenario" sortKey="scenario" sort={sort} onSort={changeSort} />
            <SortHead label="Functional area" sortKey="functionalArea" sort={sort} onSort={changeSort} />
            <SortHead label="Status" sortKey="status" sort={sort} onSort={changeSort} />
            <SortHead label="Severity" sortKey="severity" sort={sort} onSort={changeSort} />
            <SortHead label="Grade" sortKey="grade" sort={sort} onSort={changeSort} />
            <SortHead label="Usability" sortKey="usabilityRating" sort={sort} onSort={changeSort} />
            <TableHead>Signals</TableHead>
            <SortHead label="Started" sortKey="startedAt" sort={sort} onSort={changeSort} />
            <SortHead label="Completed" sortKey="completedAt" sort={sort} onSort={changeSort} />
            <SortHead label="Updated" sortKey="updatedAt" sort={sort} onSort={changeSort} />
            <TableHead>Evidence</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {filtered.map((row) => <TableRow key={row.resultId}>
              <TableCell className="font-medium">{row.testerName}</TableCell>
              <TableCell>{row.testerEmail ?? "—"}{row.testerPersona ? <span className="block text-xs text-foreground-muted">{row.testerPersona}</span> : null}</TableCell>
              <TableCell>{row.vendorName}</TableCell>
              <TableCell>{row.testCaseId}</TableCell>
              <TableCell className="max-w-xs truncate" title={row.scenario}>{row.scenario}</TableCell>
              <TableCell>{row.functionalArea}</TableCell>
              <TableCell><StatusBadge status={row.status} /></TableCell>
              <TableCell>{row.severity ? <SeverityBadge severity={row.severity} /> : "—"}</TableCell>
              <TableCell>{row.grade ?? "Missing"}</TableCell>
              <TableCell>{row.usabilityRating ?? "—"}</TableCell>
              <TableCell className="max-w-56 text-xs">{[
                row.improvementNeeded ? "Improvement" : "",
                row.configurationRequired ? "Configuration" : "",
                row.vendorAssistanceRequired ? "Vendor help" : "",
              ].filter(Boolean).join(" · ") || "—"}</TableCell>
              <TableCell>{formatDate(row.startedAt)}</TableCell>
              <TableCell>{formatDate(row.completedAt)}</TableCell>
              <TableCell>{formatDate(row.updatedAt)}</TableCell>
              <TableCell><div className="flex flex-wrap gap-1">
                {row.evidence.length === 0 ? <span className="text-xs text-foreground-muted">None</span> : null}
                {row.evidence.map((evidence) => <Button key={evidence.id} size="sm" variant="outline" onClick={() => handleViewEvidence(evidence)}>{evidence.kind === "url" ? "Link" : "File"}</Button>)}
              </div></TableCell>
            </TableRow>)}
            {filtered.length === 0 ? <TableRow><TableCell colSpan={15} className="py-12 text-center text-sm text-foreground-muted">No results match these filters.</TableCell></TableRow> : null}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function Filter({ label, value, values, onChange, missingLabel }: { label: string; value: string; values: string[]; onChange: (value: string) => void; missingLabel?: string }) {
  return <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-foreground-muted">{label}<select aria-label={`Filter by ${label.toLowerCase()}`} className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground" value={value} onChange={(event) => onChange(event.target.value)}><option value={ALL}>All</option>{values.map((item) => <option key={item} value={item === MISSING ? MISSING : item}>{item === MISSING ? missingLabel ?? "Missing" : item}</option>)}</select></label>;
}

function BooleanFilter({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-foreground-muted">{label}<select aria-label={`Filter by ${label.toLowerCase()}`} className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground" value={value} onChange={(event) => onChange(event.target.value)}><option value={ALL}>All</option><option value="yes">Yes</option><option value="no">No</option></select></label>;
}

function SortHead({ label, sortKey, sort, onSort }: { label: string; sortKey: SortKey; sort: SortState; onSort: (key: SortKey) => void }) {
  const active = sort.key === sortKey;
  return <TableHead aria-sort={active ? sort.direction === "asc" ? "ascending" : "descending" : "none"}><button type="button" className="whitespace-nowrap font-medium hover:text-foreground" onClick={() => onSort(sortKey)}>{label}{active ? sort.direction === "asc" ? " ↑" : " ↓" : " ↕"}</button></TableHead>;
}

function matches(value: string | null, filter: string, missingAware = false) {
  if (filter === ALL) return true;
  if (filter === MISSING && missingAware) return value === null;
  return value === filter;
}

function matchesBoolean(value: boolean | null, filter: string) {
  if (filter === ALL) return true;
  return filter === "yes" ? value === true : value === false;
}

function unique(values: string[]) {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function compareRows(left: AdminResultRow, right: AdminResultRow, sort: SortState) {
  const leftValue = left[sort.key];
  const rightValue = right[sort.key];
  let comparison = 0;
  if (typeof leftValue === "number" || typeof rightValue === "number") {
    comparison = (typeof leftValue === "number" ? leftValue : Number.NEGATIVE_INFINITY) -
      (typeof rightValue === "number" ? rightValue : Number.NEGATIVE_INFINITY);
  } else {
    comparison = String(leftValue ?? "").localeCompare(String(rightValue ?? ""), undefined, { sensitivity: "base", numeric: true });
  }
  return comparison * (sort.direction === "asc" ? 1 : -1);
}

function sortLabel(key: SortKey) {
  return ({ testerName: "tester", vendorName: "tool", testCaseId: "case", scenario: "scenario", functionalArea: "area", status: "status", severity: "severity", grade: "grade", usabilityRating: "usability", startedAt: "start date", completedAt: "completion date", updatedAt: "updated date" })[key];
}

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}