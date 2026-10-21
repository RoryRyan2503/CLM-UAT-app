import { getProgressOverview } from "@/lib/data/progress";
import { getOverviewAttentionEnabled } from "@/lib/data/appSettings";
import { OverviewAnalytics } from "@/components/admin/overview-analytics";

export default async function AdminOverviewPage() {
  const [overview, attentionEnabled] = await Promise.all([getProgressOverview(), getOverviewAttentionEnabled()]);
  return <OverviewAnalytics overview={overview} attentionEnabled={attentionEnabled} />;
}
