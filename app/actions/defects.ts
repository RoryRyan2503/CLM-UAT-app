"use server";

import { requireTesterSession } from "@/lib/auth/testerSession";
import { createDefect } from "@/lib/data/defects";
import { runAction } from "@/lib/actionResult";

export async function createDefectAction(input: {
  testResultId: string;
  vendorId: string;
  title: string;
  description?: string;
  severity?: string;
}) {
  return runAction(async () => {
    const tester = await requireTesterSession();
    return createDefect(tester.id, input);
  });
}
