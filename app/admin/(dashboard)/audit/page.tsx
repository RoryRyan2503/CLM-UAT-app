import { listAuditHistory } from "@/lib/data/auditHistory";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

interface AuditJoinRow {
  id: string;
  change_type: string;
  changed_by_admin: boolean;
  version: number;
  created_at: string;
  testers: { name: string } | null;
  test_results: {
    assignments: {
      vendors: { name: string } | null;
      test_cases: { test_case_id: string } | null;
    } | null;
  } | null;
}

export default async function AdminAuditPage() {
  const history = (await listAuditHistory()) as unknown as AuditJoinRow[];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Audit history</h1>
        <p className="text-sm text-foreground-muted">Most recent 200 changes to test results, newest first.</p>
      </div>
      <div className="overflow-hidden rounded-lg border border-border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead>
              <TableHead>Changed by</TableHead>
              <TableHead>Test Case</TableHead>
              <TableHead>Vendor</TableHead>
              <TableHead>Change</TableHead>
              <TableHead className="text-right">Version</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {history.map((h) => (
              <TableRow key={h.id}>
                <TableCell>{new Date(h.created_at).toLocaleString()}</TableCell>
                <TableCell>{h.changed_by_admin ? "Admin" : h.testers?.name ?? "Unknown"}</TableCell>
                <TableCell>{h.test_results?.assignments?.test_cases?.test_case_id ?? "—"}</TableCell>
                <TableCell>{h.test_results?.assignments?.vendors?.name ?? "—"}</TableCell>
                <TableCell>
                  <Badge variant="outline">{h.change_type}</Badge>
                </TableCell>
                <TableCell className="text-right">{h.version}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
