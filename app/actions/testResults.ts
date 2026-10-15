"use server";

import { requireTesterSession } from "@/lib/auth/testerSession";
import { saveTestResultDraft, submitTestResult } from "@/lib/data/testResults";
import { testResultDraftSchema } from "@/lib/validation/testResult";
import { AppError, runAction } from "@/lib/actionResult";
import { revalidatePath } from "next/cache";

export async function saveDraftAction(input: unknown) {
  return runAction(async () => {
    const tester = await requireTesterSession();
    const parsed = testResultDraftSchema.safeParse(input);
    if (!parsed.success) throw new AppError("VALIDATION", "Invalid draft data.");
    const result = await saveTestResultDraft(tester.id, parsed.data);
    return result;
  });
}

export async function submitResultAction(input: unknown) {
  return runAction(async () => {
    const tester = await requireTesterSession();
    const parsed = testResultDraftSchema.safeParse(input);
    if (!parsed.success) throw new AppError("VALIDATION", "Invalid result data.");
    const result = await submitTestResult(tester.id, parsed.data);
    revalidatePath("/dashboard");
    revalidatePath("/assignments");
    return result;
  });
}
