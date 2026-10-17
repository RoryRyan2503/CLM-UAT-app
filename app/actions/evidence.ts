"use server";

import { requireTesterSession } from "@/lib/auth/testerSession";
import {
  uploadEvidenceFile,
  registerEvidenceUrl,
} from "@/lib/data/evidence";
import { APP_BASE_PATH } from "@/lib/constants";
import { AppError, runAction } from "@/lib/actionResult";

export async function uploadEvidenceFileAction(testResultId: string, formData: FormData) {
  return runAction(async () => {
    const tester = await requireTesterSession();
    const file = formData.get("file");
    if (!(file instanceof File)) throw new AppError("VALIDATION", "Choose a file to upload.");
    return uploadEvidenceFile(tester.id, testResultId, file);
  });
}

export async function registerEvidenceUrlAction(testResultId: string, url: string) {
  return runAction(async () => {
    const tester = await requireTesterSession();
    return registerEvidenceUrl(tester.id, testResultId, url);
  });
}

export async function getSignedEvidenceUrlAction(evidenceId: string) {
  return runAction(async () => {
    await requireTesterSession();
    return `${APP_BASE_PATH}/api/evidence?id=${encodeURIComponent(evidenceId)}`;
  });
}
