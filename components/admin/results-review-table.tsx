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

export function ResultsReviewTable({ results }: { results: AdminResultRow[] }) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return results;
    return results.filter(
      (r) =>
        r.testerName.toLowerCase().includes(q) ||
        r.testCaseId.toLowerCase().includes(q) ||
        r.functionalArea.toLowerCase().includes(q) ||
        r.vendorName.toLowerCase().includes(q),
    );
  }, [results, search]);

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

  return (
    <div className="flex flex-col gap-4">
      <Input
        placeholder="Search by tester, test case, vendor, or area…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="sm:max-w-sm"
      />
      <div className="overflow-hidden rounded-lg border border-border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tester</TableHead>
              <TableHead>Vendor</TableHead>
              <TableHead>Test Case</TableHead>
              <TableHead>Functional Area</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Severity</TableHead>
              <TableHead>Grade</TableHead>
              <TableHead>Evidence</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((r) => (
              <TableRow key={r.resultId}>
                <TableCell>{r.testerName}</TableCell>
                <TableCell>{r.vendorName}</TableCell>
                <TableCell className="font-medium">{r.testCaseId}</TableCell>
                <TableCell>{r.functionalArea}</TableCell>
                <TableCell>
                  <StatusBadge status={r.status} />
                </TableCell>
                <TableCell>{r.severity ? <SeverityBadge severity={r.severity} /> : "—"}</TableCell>
                <TableCell>{r.grade ?? "—"}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {r.evidence.length === 0 ? <span className="text-xs text-foreground-muted">None</span> : null}
                    {r.evidence.map((e) => (
                      <Button key={e.id} size="sm" variant="outline" onClick={() => handleViewEvidence(e)}>
                        {e.label}
                      </Button>
                    ))}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
