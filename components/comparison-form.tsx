"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/status-badge";
import { SeverityBadge } from "@/components/severity-badge";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { PREFERRED_VENDOR_VALUES } from "@/lib/constants";
import { saveComparisonAction } from "@/app/actions/comparisons";
import type { VendorWorkflowSlice } from "@/lib/data/testCaseWorkflow";
import type { Database } from "@/lib/types/database";

type ComparisonRow = Database["public"]["Tables"]["comparisons"]["Row"];

export function ComparisonForm({
  testerId,
  testCaseId,
  ironclad,
  sirion,
  comparison,
}: {
  testerId: string;
  testCaseId: string;
  ironclad: VendorWorkflowSlice;
  sirion: VendorWorkflowSlice;
  comparison: ComparisonRow | null;
}) {
  const [preferredVendor, setPreferredVendor] = useState(comparison?.preferred_vendor ?? "");
  const [comments, setComments] = useState(comparison?.comments ?? "");
  const [version, setVersion] = useState(comparison?.version ?? 0);
  const [isSaving, setIsSaving] = useState(false);

  async function handleSave() {
    setIsSaving(true);
    const res = await saveComparisonAction({
      testerId,
      testCaseId,
      version,
      preferredVendor: preferredVendor || null,
      comments,
    });
    setIsSaving(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setVersion(res.data.version);
    toast.success("Comparison saved.");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ironclad vs. Sirion comparison</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Attribute</TableHead>
              <TableHead>Ironclad</TableHead>
              <TableHead>Sirion</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell className="font-medium">Status</TableCell>
              <TableCell>
                <StatusBadge status={ironclad.result.status} />
              </TableCell>
              <TableCell>
                <StatusBadge status={sirion.result.status} />
              </TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="font-medium">Grade</TableCell>
              <TableCell>{ironclad.result.grade ?? "—"}</TableCell>
              <TableCell>{sirion.result.grade ?? "—"}</TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="font-medium">Severity</TableCell>
              <TableCell>{ironclad.result.severity ? <SeverityBadge severity={ironclad.result.severity} /> : "—"}</TableCell>
              <TableCell>{sirion.result.severity ? <SeverityBadge severity={sirion.result.severity} /> : "—"}</TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="font-medium">Usability</TableCell>
              <TableCell>{ironclad.result.usability_rating ?? "—"}/5</TableCell>
              <TableCell>{sirion.result.usability_rating ?? "—"}/5</TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="font-medium">Duration</TableCell>
              <TableCell>{duration(ironclad.result.started_at, ironclad.result.completed_at)}</TableCell>
              <TableCell>{duration(sirion.result.started_at, sirion.result.completed_at)}</TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="font-medium">Configuration required</TableCell>
              <TableCell>{yesNo(ironclad.result.configuration_required)}</TableCell>
              <TableCell>{yesNo(sirion.result.configuration_required)}</TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="font-medium">Vendor assistance required</TableCell>
              <TableCell>{yesNo(ironclad.result.vendor_assistance_required)}</TableCell>
              <TableCell>{yesNo(sirion.result.vendor_assistance_required)}</TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="font-medium">Defects</TableCell>
              <TableCell>{ironclad.defect?.defect_code ?? "—"}</TableCell>
              <TableCell>{sirion.defect?.defect_code ?? "—"}</TableCell>
            </TableRow>
          </TableBody>
        </Table>

        <div className="flex flex-col gap-2">
          <Label>Preferred vendor</Label>
          <RadioGroup className="flex flex-wrap gap-4" value={preferredVendor} onValueChange={setPreferredVendor}>
            {PREFERRED_VENDOR_VALUES.map((v) => (
              <label key={v} className="flex items-center gap-1.5 text-sm">
                <RadioGroupItem value={v} /> {v}
              </label>
            ))}
          </RadioGroup>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Comparison comments</Label>
          <Textarea value={comments} onChange={(e) => setComments(e.target.value)} />
        </div>
      </CardContent>
      <CardFooter className="justify-end">
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? "Saving…" : "Save comparison"}
        </Button>
      </CardFooter>
    </Card>
  );
}

function yesNo(value: boolean | null): string {
  if (value === true) return "Yes";
  if (value === false) return "No";
  return "—";
}

function duration(startedAt: string | null, completedAt: string | null): string {
  if (!startedAt || !completedAt) return "—";
  const minutes = Math.round((new Date(completedAt).getTime() - new Date(startedAt).getTime()) / 60000);
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}
