import { listAllResults } from "@/lib/data/adminResults";
import { ResultsReviewTable } from "@/components/admin/results-review-table";

export default async function AdminResultsPage() {
  const results = await listAllResults();
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Results review</h1>
        <p className="text-sm text-foreground-muted">All submitted and in-progress results across every tester.</p>
      </div>
      <ResultsReviewTable results={results} />
    </div>
  );
}
