"use server";

import { requireTesterSession } from "@/lib/auth/testerSession";
import { createDefect, updateDefect } from "@/lib/data/defects";
import { AppError, runAction } from "@/lib/actionResult";
import { createDefectSchema, updateDefectSchema } from "@/lib/validation/defect";

export async function createDefectAction(input: unknown) {
  return runAction(async () => {
    const tester = await requireTesterSession();
    const parsed = createDefectSchema.safeParse(input);
    if (!parsed.success) throw new AppError("VALIDATION", "Please provide a defect title and valid details.");
    return createDefect(tester.id, parsed.data);
  });
}

export async function updateDefectAction(input: unknown) {
  return runAction(async () => {
    const tester = await requireTesterSession();
    const parsed = updateDefectSchema.safeParse(input);
    if (!parsed.success) throw new AppError("VALIDATION", "Please provide a defect title and valid details.");
    return updateDefect(tester.id, parsed.data);
  });
}
