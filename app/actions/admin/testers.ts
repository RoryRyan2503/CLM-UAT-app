"use server";

import { requireAdminSession } from "@/lib/auth/adminSession";
import {
  createTester,
  createTestersBulk,
  updateTester,
  setTesterActive,
  deleteTester,
  resetAccessCode,
} from "@/lib/data/testers";
import { createTesterSchema } from "@/lib/validation/tester";
import { AppError, runAction } from "@/lib/actionResult";
import { revalidatePath } from "next/cache";
import { parseTesterRoster } from "@/lib/import/parseTesterRoster";

const MAX_TESTER_ROSTER_BYTES = 2 * 1024 * 1024;

export async function createTesterAction(formData: FormData) {
  return runAction(async () => {
    await requireAdminSession();
    const parsed = createTesterSchema.safeParse({
      name: formData.get("name"),
      email: formData.get("email"),
      department: formData.get("department"),
      personaId: formData.get("personaId"),
    });
    if (!parsed.success) throw new AppError("VALIDATION", "Please check the tester details.");
    const result = await createTester(parsed.data);
    revalidatePath("/admin/testers");
    return result;
  });
}

export async function bulkCreateTestersAction(formData: FormData) {
  return runAction(async () => {
    await requireAdminSession();
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      throw new AppError("VALIDATION", "Choose a CSV or Excel tester roster.");
    }
    if (file.size > MAX_TESTER_ROSTER_BYTES) {
      throw new AppError("VALIDATION", "Tester roster file must be 2 MB or smaller.");
    }
    if (!/\.(csv|xlsx|xls)$/i.test(file.name)) {
      throw new AppError("VALIDATION", "Upload a .csv, .xlsx, or .xls file.");
    }

    let parsed;
    try {
      parsed = parseTesterRoster(Buffer.from(await file.arrayBuffer()), file.name);
    } catch (error) {
      throw new AppError("VALIDATION", error instanceof Error ? error.message : "Unable to read tester roster.");
    }

    if (parsed.rows.length > 100) {
      return { created: [], errors: [{ rowNumber: 1, message: "Import at most 100 testers per file." }] };
    }
    if (parsed.errors.length > 0) return { created: [], errors: parsed.errors };

    const result = await createTestersBulk(parsed.rows);
    if (result.created.length > 0) {
      revalidatePath("/admin/testers");
      revalidatePath("/admin/assignments");
    }
    return result;
  });
}

export async function updateTesterAction(testerId: string, formData: FormData) {
  return runAction(async () => {
    await requireAdminSession();
    const parsed = createTesterSchema.safeParse({
      name: formData.get("name"),
      email: formData.get("email"),
      department: formData.get("department"),
      personaId: formData.get("personaId"),
    });
    if (!parsed.success) throw new AppError("VALIDATION", "Please check the tester details.");
    const result = await updateTester(testerId, parsed.data);
    revalidatePath("/admin/testers");
    return result;
  });
}

export async function setTesterActiveAction(testerId: string, isActive: boolean) {
  return runAction(async () => {
    await requireAdminSession();
    const result = await setTesterActive(testerId, isActive);
    revalidatePath("/admin/testers");
    return result;
  });
}

export async function deleteTesterAction(testerId: string) {
  return runAction(async () => {
    await requireAdminSession();
    await deleteTester(testerId);
    revalidatePath("/admin/testers");
    revalidatePath("/admin/assignments");
    revalidatePath("/admin");
    return null;
  });
}

export async function resetAccessCodeAction(testerId: string) {
  return runAction(async () => {
    await requireAdminSession();
    const accessCode = await resetAccessCode(testerId);
    revalidatePath("/admin/testers");
    return { accessCode };
  });
}
