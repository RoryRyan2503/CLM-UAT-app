"use server";

import { requireAdminSession } from "@/lib/auth/adminSession";
import {
  createTester,
  updateTester,
  setTesterActive,
  deleteTester,
  resetAccessCode,
} from "@/lib/data/testers";
import { createTesterSchema } from "@/lib/validation/tester";
import { AppError, runAction } from "@/lib/actionResult";
import { revalidatePath } from "next/cache";

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
