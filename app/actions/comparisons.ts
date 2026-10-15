"use server";

import { requireTesterSession } from "@/lib/auth/testerSession";
import { upsertComparison } from "@/lib/data/comparisons";
import { comparisonSchema } from "@/lib/validation/comparison";
import { AppError, runAction } from "@/lib/actionResult";
import { revalidatePath } from "next/cache";

export async function saveComparisonAction(input: unknown) {
  return runAction(async () => {
    const tester = await requireTesterSession();
    const parsed = comparisonSchema.safeParse(input);
    if (!parsed.success) throw new AppError("VALIDATION", "Invalid comparison data.");
    const result = await upsertComparison(tester.id, parsed.data);
    revalidatePath("/assignments");
    return result;
  });
}
