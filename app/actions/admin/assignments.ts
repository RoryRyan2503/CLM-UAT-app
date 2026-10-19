"use server";

import { z } from "zod";
import { requireAdminSession } from "@/lib/auth/adminSession";
import {
  applyPersonaDefaults,
  applyPersonaDefaultsToTesters,
  createPersona,
  setPersonaTestCase,
  setPersonaTestCases,
  setTesterCases,
  setTesterPersona,
} from "@/lib/data/adminAssignments";
import { AppError, runAction } from "@/lib/actionResult";
import { revalidatePath } from "next/cache";

const testerPersonaSchema = z.object({ testerId: z.string().uuid(), personaId: z.string().uuid() });
const personaSchema = z.object({ name: z.string().trim().min(1).max(120) });
const personaCaseSchema = z.object({ personaId: z.string().uuid(), testCaseId: z.string().uuid(), included: z.boolean() });
const personaCasesSchema = z.object({ personaId: z.string().uuid(), testCaseIds: z.array(z.string().uuid()).max(200), included: z.boolean() });
const testerCasesSchema = z.object({ testerId: z.string().uuid(), testCaseIds: z.array(z.string().uuid()).max(200), assigned: z.boolean() });
const testerIdSchema = z.string().uuid();
const testerIdsSchema = z.array(z.string().uuid()).min(1).max(200);

function revalidateAssignmentViews() {
  revalidatePath("/admin/assignments");
  revalidatePath("/admin");
}

export async function setTesterPersonaAction(input: unknown) {
  return runAction(async () => {
    await requireAdminSession();
    const parsed = testerPersonaSchema.safeParse(input);
    if (!parsed.success) throw new AppError("VALIDATION", "Invalid tester persona.");
    await setTesterPersona(parsed.data.testerId, parsed.data.personaId);
    revalidateAssignmentViews();
    return null;
  });
}

export async function createPersonaAction(input: unknown) {
  return runAction(async () => {
    await requireAdminSession();
    const parsed = personaSchema.safeParse(input);
    if (!parsed.success) throw new AppError("VALIDATION", "Enter a persona name.");
    const persona = await createPersona(parsed.data.name);
    revalidateAssignmentViews();
    return persona;
  });
}

export async function setPersonaTestCaseAction(input: unknown) {
  return runAction(async () => {
    await requireAdminSession();
    const parsed = personaCaseSchema.safeParse(input);
    if (!parsed.success) throw new AppError("VALIDATION", "Invalid persona test-case mapping.");
    await setPersonaTestCase(parsed.data.personaId, parsed.data.testCaseId, parsed.data.included);
    revalidateAssignmentViews();
    return null;
  });
}

export async function setPersonaTestCasesAction(input: unknown) {
  return runAction(async () => {
    await requireAdminSession();
    const parsed = personaCasesSchema.safeParse(input);
    if (!parsed.success) throw new AppError("VALIDATION", "Invalid persona test-case selection.");
    const result = await setPersonaTestCases(parsed.data.personaId, parsed.data.testCaseIds, parsed.data.included);
    revalidateAssignmentViews();
    return result;
  });
}

export async function setTesterCasesAction(input: unknown) {
  return runAction(async () => {
    await requireAdminSession();
    const parsed = testerCasesSchema.safeParse(input);
    if (!parsed.success) throw new AppError("VALIDATION", "Invalid tester assignment selection.");
    const result = await setTesterCases(parsed.data.testerId, parsed.data.testCaseIds, parsed.data.assigned);
    revalidateAssignmentViews();
    revalidatePath("/assignments");
    revalidatePath("/assignments-v2");
    return result;
  });
}

export async function applyPersonaDefaultsAction(testerId: string) {
  return runAction(async () => {
    await requireAdminSession();
    const parsed = testerIdSchema.safeParse(testerId);
    if (!parsed.success) throw new AppError("VALIDATION", "Invalid tester.");
    const result = await applyPersonaDefaults(parsed.data);
    revalidateAssignmentViews();
    revalidatePath("/assignments");
    revalidatePath("/assignments-v2");
    return result;
  });
}

export async function applyPersonaDefaultsToTestersAction(input: unknown) {
  return runAction(async () => {
    await requireAdminSession();
    const parsed = testerIdsSchema.safeParse(input);
    if (!parsed.success) throw new AppError("VALIDATION", "Select between 1 and 200 active testers.");
    const result = await applyPersonaDefaultsToTesters(parsed.data);
    revalidateAssignmentViews();
    revalidatePath("/assignments");
    revalidatePath("/assignments-v2");
    return result;
  });
}
