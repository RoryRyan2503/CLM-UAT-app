"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SeverityBadge } from "@/components/severity-badge";
import { updateDefectStatusAction } from "@/app/actions/admin/defects";
import { DEFECT_STATUS_VALUES } from "@/lib/constants";

interface DefectJoinRow {
  id: string;
  defect_code: string;
  title: string;
  severity: string | null;
  status: string;
  vendors: { name: string } | null;
  test_results: {
    assignments: {
      testers: { name: string } | null;
      test_cases: { test_case_id: string } | null;
    } | null;
  } | null;
}

export function DefectsManager({ defects }: { defects: DefectJoinRow[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleStatusChange(defectId: string, status: string) {
    startTransition(async () => {
      const res = await updateDefectStatusAction(defectId, status);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-background">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Defect</TableHead>
            <TableHead>Test Case</TableHead>
            <TableHead>Vendor</TableHead>
            <TableHead>Tester</TableHead>
            <TableHead>Severity</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {defects.map((d) => (
            <TableRow key={d.id}>
              <TableCell className="font-medium">
                {d.defect_code}
                <div className="text-xs font-normal text-foreground-muted">{d.title}</div>
              </TableCell>
              <TableCell>{d.test_results?.assignments?.test_cases?.test_case_id ?? "—"}</TableCell>
              <TableCell>{d.vendors?.name ?? "—"}</TableCell>
              <TableCell>{d.test_results?.assignments?.testers?.name ?? "—"}</TableCell>
              <TableCell>{d.severity ? <SeverityBadge severity={d.severity} /> : "—"}</TableCell>
              <TableCell>
                <Select
                  value={d.status}
                  onValueChange={(v) => handleStatusChange(d.id, v)}
                  disabled={isPending}
                >
                  <SelectTrigger className="w-44">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DEFECT_STATUS_VALUES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
