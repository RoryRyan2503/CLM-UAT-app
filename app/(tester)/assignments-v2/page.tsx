import { requireTesterSession } from "@/lib/auth/testerSession";
import { listAssignmentsForTester } from "@/lib/data/assignments";
import { getEvidenceMode } from "@/lib/data/appSettings";
import { AssignmentsV2 } from "@/components/assignments-v2";

export default async function AssignmentsV2Page() {
  const tester = await requireTesterSession();
  const [assignments, evidenceMode] = await Promise.all([
    listAssignmentsForTester(tester.id),
    getEvidenceMode(),
  ]);

  return <AssignmentsV2 assignments={assignments} testerId={tester.id} evidenceMode={evidenceMode} />;
}
