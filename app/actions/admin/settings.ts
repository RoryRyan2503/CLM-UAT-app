"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AppError, runAction } from "@/lib/actionResult";
import { requireAdminSession } from "@/lib/auth/adminSession";
import { setEvidenceEnabled } from "@/lib/data/appSettings";

const evidenceSettingSchema = z.object({ enabled: z.boolean() });

export async function setEvidenceEnabledAction(input: unknown) {
  return runAction(async () => {
    await requireAdminSession();
    const parsed = evidenceSettingSchema.safeParse(input);
    if (!parsed.success) throw new AppError("VALIDATION", "Invalid evidence setting.");
    await setEvidenceEnabled(parsed.data.enabled);
    revalidatePath("/admin/settings");
    return parsed.data.enabled;
  });
}
