"use server";

import { requireAdminSession } from "@/lib/auth/adminSession";
import { updateDefectStatus } from "@/lib/data/defects";
import { runAction } from "@/lib/actionResult";
import { revalidatePath } from "next/cache";

export async function updateDefectStatusAction(defectId: string, status: string) {
  return runAction(async () => {
    await requireAdminSession();
    const result = await updateDefectStatus(defectId, status);
    revalidatePath("/admin/defects");
    return result;
  });
}
