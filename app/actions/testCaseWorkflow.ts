"use server";

import { requireTesterSession } from "@/lib/auth/testerSession";
import { getTestCaseWorkflow } from "@/lib/data/testCaseWorkflow";
import { runAction } from "@/lib/actionResult";

export async function loadTestCaseWorkflowAction(testCaseUuid: string) {
  return runAction(async () => {
    const tester = await requireTesterSession();
    return getTestCaseWorkflow(tester.id, testCaseUuid);
  });
}
