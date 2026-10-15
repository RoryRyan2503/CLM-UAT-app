"use server";

import { requireTesterSession } from "@/lib/auth/testerSession";
import {
  createEvidenceUploadUrl,
  registerEvidenceFile,
  registerEvidenceUrl,
  getSignedEvidenceUrl,
} from "@/lib/data/evidence";
import { runAction } from "@/lib/actionResult";

export async function createEvidenceUploadUrlAction(testResultId: string, fileName: string) {
  return runAction(async () => {
    const tester = await requireTesterSession();
    return createEvidenceUploadUrl(tester.id, testResultId, fileName);
  });
}

export async function registerEvidenceFileAction(
  testResultId: string,
  params: { path: string; fileName: string; mimeType: string; sizeBytes: number },
) {
  return runAction(async () => {
    const tester = await requireTesterSession();
    return registerEvidenceFile(tester.id, testResultId, params);
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
    const tester = await requireTesterSession();
    return getSignedEvidenceUrl(evidenceId, { testerId: tester.id });
  });
}
