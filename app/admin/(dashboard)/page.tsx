import { getProgressOverview } from "@/lib/data/progress";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProgressStatCard } from "@/components/progress-stat-card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";

export default async function AdminOverviewPage() {
  const overview = await getProgressOverview();

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-xl font-semibold">Progress overview</h1>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {overview.byVendor.map((v) => (
          <ProgressStatCard key={v.vendorSlug} title={v.vendorName} completed={v.completed} total={v.total} />
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">By tester</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tester</TableHead>
                <TableHead>Ironclad</TableHead>
                <TableHead>Sirion</TableHead>
                <TableHead>Overall progress</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {overview.byTester.map((t) => (
                <TableRow key={t.testerId}>
                  <TableCell className="font-medium">{t.testerName}</TableCell>
                  <TableCell>
                    <span className="font-medium">{t.ironcladCompleted}/{t.ironcladTotal}</span>
                    <span className="ml-2 text-xs text-foreground-muted">complete</span>
                  </TableCell>
                  <TableCell>
                    <span className="font-medium">{t.sirionCompleted}/{t.sirionTotal}</span>
                    <span className="ml-2 text-xs text-foreground-muted">complete</span>
                  </TableCell>
                  <TableCell className="min-w-56">
                    <div className="flex items-center gap-3">
                      <Progress value={t.total === 0 ? 0 : Math.round((t.completed / t.total) * 100)} />
                      <span className="whitespace-nowrap text-xs text-foreground-muted">{t.completed}/{t.total}</span>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">By functional area</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Functional area</TableHead>
                <TableHead>Progress</TableHead>
                <TableHead className="text-right">Completed</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {overview.byFunctionalArea.map((a) => (
                <TableRow key={a.functionalArea}>
                  <TableCell className="font-medium">{a.functionalArea}</TableCell>
                  <TableCell>
                    <Progress value={a.total === 0 ? 0 : Math.round((a.completed / a.total) * 100)} />
                  </TableCell>
                  <TableCell className="text-right">
                    {a.completed}/{a.total}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
