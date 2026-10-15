import { getAdminAssignmentOverview } from "@/lib/data/adminAssignments";
import { AssignmentManager } from "@/components/admin/assignment-manager";

export default async function AdminAssignmentsPage() {
  const overview = await getAdminAssignmentOverview();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Persona-based assignments</h1>
        <p className="text-sm text-foreground-muted">
          Configure reusable persona defaults, then tailor each active tester’s cases. Removing a case hides it from their workspace without deleting evaluation history.
        </p>
      </div>
      <AssignmentManager overview={overview} />
    </div>
  );
}
