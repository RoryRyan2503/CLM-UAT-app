"use server";

import { requireAdminSession } from "@/lib/auth/adminSession";
import { runAction } from "@/lib/actionResult";
import { APP_BASE_PATH } from "@/lib/constants";

export async function getAdminSignedEvidenceUrlAction(evidenceId: string) {
  return runAction(async () => {
    await requireAdminSession();
    return `${APP_BASE_PATH}/api/evidence?id=${encodeURIComponent(evidenceId)}`;
  });
}
