"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AppError, runAction } from "@/lib/actionResult";
import { requireAdminSession } from "@/lib/auth/adminSession";
import { setEvidenceMode, type EvidenceMode } from "@/lib/data/appSettings";

const evidenceSettingSchema = z.object({ mode: z.enum(["disabled", "sharepoint", "upload"]) });

export async function setEvidenceModeAction(input: unknown) {
  return runAction(async () => {
    await requireAdminSession();
    const parsed = evidenceSettingSchema.safeParse(input);
    if (!parsed.success) throw new AppError("VALIDATION", "Invalid evidence setting.");
    const mode: EvidenceMode = parsed.data.mode;
    await setEvidenceMode(mode);
    revalidatePath("/admin/settings");
    revalidatePath("/test", "page");
    revalidatePath("/assignments-v2");
    return mode;
  });
}
