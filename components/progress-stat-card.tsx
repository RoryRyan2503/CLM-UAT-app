import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

export function ProgressStatCard({
  title,
  completed,
  total,
}: {
  title: string;
  completed: number;
  total: number;
}) {
  const pct = total === 0 ? 0 : Math.round((completed / total) * 100);
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-foreground-muted">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="mb-2 flex items-baseline justify-between">
          <span className="text-2xl font-semibold">
            {completed}/{total}
          </span>
          <span className="text-sm text-foreground-muted">{pct}%</span>
        </div>
        <Progress value={pct} />
      </CardContent>
    </Card>
  );
}
