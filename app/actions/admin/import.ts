"use server";

import { requireAdminSession } from "@/lib/auth/adminSession";
import { parseTestCaseWorkbook } from "@/lib/import/parseWorkbook";
import { commitTestCaseImport } from "@/lib/data/importTestCases";
import { AppError, runAction } from "@/lib/actionResult";
import { revalidatePath } from "next/cache";

const MAX_IMPORT_BYTES = 10 * 1024 * 1024;

export async function previewImportAction(formData: FormData) {
  return runAction(async () => {
    await requireAdminSession();
    const file = formData.get("file");
    if (!(file instanceof File)) throw new AppError("VALIDATION", "Please choose a file to upload.");
    if (file.size > MAX_IMPORT_BYTES) throw new AppError("VALIDATION", "File is too large (max 10 MB).");

    const buffer = Buffer.from(await file.arrayBuffer());
    const preview = parseTestCaseWorkbook(buffer, file.name);
    return { ...preview, fileName: file.name };
  });
}

export async function commitImportAction(formData: FormData) {
  return runAction(async () => {
    const admin = await requireAdminSession();
    const file = formData.get("file");
    if (!(file instanceof File)) throw new AppError("VALIDATION", "Please choose a file to upload.");

    const buffer = Buffer.from(await file.arrayBuffer());
    const preview = parseTestCaseWorkbook(buffer, file.name);
    if (preview.rowErrors.length > 0 || preview.duplicateTestCaseIds.length > 0) {
      throw new AppError("VALIDATION", "Resolve row errors and duplicate IDs before importing.");
    }
    if (preview.fullCatalog && preview.validRows.length === 0) {
      throw new AppError("VALIDATION", "A full catalog import must contain at least one valid test case.");
    }

    const result = await commitTestCaseImport(preview.validRows, file.name, admin.id, preview.fullCatalog);
    revalidatePath("/admin/import");
    revalidatePath("/admin/assignments");
    return result;
  });
}
