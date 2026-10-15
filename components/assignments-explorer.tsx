"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import type { AssignmentListItem } from "@/lib/data/assignments";

const ALL = "__all__";

export function AssignmentsExplorer({ assignments }: { assignments: AssignmentListItem[] }) {
  const [search, setSearch] = useState("");
  const [area, setArea] = useState(ALL);
  const [status, setStatus] = useState(ALL);

  const functionalAreas = useMemo(
    () => Array.from(new Set(assignments.map((a) => a.functionalArea))).sort(),
    [assignments],
  );

  const filtered = assignments.filter((a) => {
    const matchesSearch =
      !search ||
      a.testCaseId.toLowerCase().includes(search.toLowerCase()) ||
      a.scenario.toLowerCase().includes(search.toLowerCase());
    const matchesArea = area === ALL || a.functionalArea === area;
    const matchesStatus = status === ALL || a.ironcladStatus === status || a.sirionStatus === status;
    return matchesSearch && matchesArea && matchesStatus;
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row">
        <Input
          placeholder="Search by test case ID or scenario…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="sm:max-w-xs"
        />
        <Select value={area} onValueChange={setArea}>
          <SelectTrigger className="sm:w-56">
            <SelectValue placeholder="Functional area" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All functional areas</SelectItem>
            {functionalAreas.map((a) => (
              <SelectItem key={a} value={a}>
                {a}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="sm:w-48">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Any status</SelectItem>
            {["Not Started", "In Progress", "Pass", "Pass with Observation", "Fail", "Blocked", "Not Applicable", "Retest Required"].map(
              (s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ),
            )}
          </SelectContent>
        </Select>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Test Case ID</TableHead>
              <TableHead>Functional Area</TableHead>
              <TableHead>Scenario</TableHead>
              <TableHead>Ironclad</TableHead>
              <TableHead>Sirion</TableHead>
              <TableHead>Comparison</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((a) => (
              <TableRow key={a.testCaseUuid}>
                <TableCell className="font-medium">
                  <Link href={`/test/${a.testCaseUuid}`} className="text-primary hover:underline">
                    {a.testCaseId}
                  </Link>
                </TableCell>
                <TableCell>{a.functionalArea}</TableCell>
                <TableCell className="max-w-sm truncate">{a.scenario}</TableCell>
                <TableCell>
                  <StatusBadge status={a.ironcladStatus} />
                </TableCell>
                <TableCell>
                  <StatusBadge status={a.sirionStatus} />
                </TableCell>
                <TableCell>
                  {a.comparisonComplete ? <Badge variant="success">Complete</Badge> : <Badge variant="outline">Pending</Badge>}
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-sm text-foreground-muted">
                  No assignments match your filters.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
