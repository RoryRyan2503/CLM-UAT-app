import { requireTesterSession } from "@/lib/auth/testerSession";
import { listAssignmentsForTester } from "@/lib/data/assignments";
import { getEvidenceEnabled } from "@/lib/data/appSettings";
import { AssignmentsV2 } from "@/components/assignments-v2";

export default async function AssignmentsV2Page() {
  const tester = await requireTesterSession();
  const [assignments, evidenceEnabled] = await Promise.all([
    listAssignmentsForTester(tester.id),
    getEvidenceEnabled(),
  ]);

  return <AssignmentsV2 assignments={assignments} testerId={tester.id} evidenceEnabled={evidenceEnabled} />;
}
