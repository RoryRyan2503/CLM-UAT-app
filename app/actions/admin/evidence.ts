"use server";

import { requireAdminSession } from "@/lib/auth/adminSession";
import { getSignedEvidenceUrl } from "@/lib/data/evidence";
import { runAction } from "@/lib/actionResult";

export async function getAdminSignedEvidenceUrlAction(evidenceId: string) {
  return runAction(async () => {
    await requireAdminSession();
    return getSignedEvidenceUrl(evidenceId, { isAdmin: true });
  });
}
