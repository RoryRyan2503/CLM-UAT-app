"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { RequiredMark } from "@/components/ui/required-mark";
import { previewImportAction, commitImportAction } from "@/app/actions/admin/import";
import type { ImportPreview } from "@/lib/validation/import";

export function ImportWorkbook() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<(ImportPreview & { fileName: string }) | null>(null);
  const [isPending, startTransition] = useTransition();

  function handlePreview(formData: FormData) {
    startTransition(async () => {
      const res = await previewImportAction(formData);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setPreview(res.data);
    });
  }

  function handleCommit() {
    if (!selectedFile) {
      toast.error("Choose the workbook again, then preview it before committing.");
      return;
    }
    const formData = new FormData();
    formData.set("file", selectedFile);
    startTransition(async () => {
      const res = await commitImportAction(formData);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`Imported: ${res.data.createdCount} created, ${res.data.updatedCount} updated, ${res.data.archivedCount} archived.`);
      setPreview(null);
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    });
  }

  const hasBlockingErrors = (preview?.rowErrors.length ?? 0) > 0 || (preview?.duplicateTestCaseIds.length ?? 0) > 0;

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">1. Choose a file</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={handlePreview} className="flex items-center gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="test-case-workbook">Workbook or CSV<RequiredMark /></Label>
              <input
                ref={fileInputRef}
                id="test-case-workbook"
                type="file"
                name="file"
                accept=".xlsx,.csv"
                required
                className="text-sm"
                onChange={(event) => {
                  setSelectedFile(event.currentTarget.files?.[0] ?? null);
                  setPreview(null);
                }}
              />
              {selectedFile ? <span className="text-xs text-foreground-muted">Selected: {selectedFile.name}</span> : null}
            </div>
            <Button type="submit" disabled={isPending}>
              Preview
            </Button>
          </form>
        </CardContent>
      </Card>

      {preview ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">2. Review preview</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-2 text-sm">
              <Badge variant="outline">Sheets: {preview.sheetNames.join(", ")}</Badge>
              <Badge variant="outline">Using: {preview.usedSheetName}</Badge>
              <Badge variant="success">{preview.validRows.length} valid rows</Badge>
              {preview.fullCatalog ? <Badge variant="critical">Full catalog: missing cases will be archived</Badge> : <Badge variant="outline">Legacy import: existing cases retained</Badge>}
              {preview.rowErrors.length > 0 ? (
                <Badge variant="critical">{preview.rowErrors.length} row errors</Badge>
              ) : null}
              {preview.duplicateTestCaseIds.length > 0 ? (
                <Badge variant="critical">{preview.duplicateTestCaseIds.length} duplicate IDs</Badge>
              ) : null}
            </div>

            {preview.rowErrors.length > 0 ? (
              <div className="rounded-md border border-critical bg-critical-bg p-3 text-sm text-critical">
                {preview.rowErrors.map((e) => (
                  <div key={e.rowNumber}>
                    Row {e.rowNumber}: {e.message}
                  </div>
                ))}
              </div>
            ) : null}

            {preview.fullCatalog ? <p className="text-sm text-foreground-muted">Evaluation records are preserved. Test cases omitted from this full catalog will be archived and cannot receive new assignments.</p> : null}

            <div className="max-h-96 overflow-auto rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Test Case ID</TableHead>
                    <TableHead>Functional Area</TableHead>
                    <TableHead>Use Case</TableHead>
                    <TableHead>Sirion Feature / Availability</TableHead>
                    <TableHead>Ironclad Feature / Availability</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.validRows.slice(0, 50).map((row) => (
                    <TableRow key={row.testCaseId}>
                      <TableCell className="font-medium">{row.testCaseId}</TableCell>
                      <TableCell>{row.functionalArea}</TableCell>
                      <TableCell className="max-w-md truncate">{row.useCase}</TableCell>
                      <TableCell className="max-w-sm"><span className="block truncate">{row.sirionFeature || "—"}</span><span className="text-xs text-foreground-muted">{row.sirionAvailability}</span></TableCell>
                      <TableCell className="max-w-sm"><span className="block truncate">{row.ironcladFeature || "—"}</span><span className="text-xs text-foreground-muted">{row.ironcladAvailability}</span></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <Button onClick={handleCommit} disabled={isPending || hasBlockingErrors} className="w-fit">
              {isPending ? "Importing…" : "Commit import"}
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
