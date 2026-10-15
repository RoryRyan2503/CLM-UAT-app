import { requireTesterSession } from "@/lib/auth/testerSession";
import { listAssignmentsForTester } from "@/lib/data/assignments";
import { AssignmentsV2 } from "@/components/assignments-v2";

export default async function AssignmentsV2Page() {
  const tester = await requireTesterSession();
  const assignments = await listAssignmentsForTester(tester.id);

  return <AssignmentsV2 assignments={assignments} testerId={tester.id} />;
}
