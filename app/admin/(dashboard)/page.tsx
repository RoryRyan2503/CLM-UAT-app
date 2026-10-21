import { getProgressOverview } from "@/lib/data/progress";
import { OverviewAnalytics } from "@/components/admin/overview-analytics";

export default async function AdminOverviewPage() {
  const overview = await getProgressOverview();
  return <OverviewAnalytics overview={overview} />;
}
