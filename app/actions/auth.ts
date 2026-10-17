"use server";

import { query } from "@/lib/db/pool";
import { createAdminSession, destroyAdminSession } from "@/lib/auth/adminSession";
import { createTesterSession, destroyTesterSession } from "@/lib/auth/testerSession";
import { hashAccessCodeForLookup, verifyAccessCode } from "@/lib/auth/accessCodes";
import { hashPassword, verifyPassword } from "@/lib/auth/passwordHash";
import { isRateLimited, recordLoginAttempt } from "@/lib/auth/rateLimit";
import { testerLoginSchema } from "@/lib/validation/tester";
import { AppError, runAction } from "@/lib/actionResult";

export async function testerLoginAction(formData: FormData) {
  return runAction(async () => {
    const parsed = testerLoginSchema.safeParse({
      name: formData.get("name"),
      accessCode: formData.get("accessCode"),
    });
    if (!parsed.success) {
      throw new AppError("VALIDATION", "Please enter your name and access code.");
    }
    const { name, accessCode } = parsed.data;
    const identifier = name.trim().toLowerCase();

    if (await isRateLimited(identifier)) {
      throw new AppError("FORBIDDEN", "Too many attempts. Please try again later.");
    }

    const lookup = hashAccessCodeForLookup(accessCode);
    const { rows } = await query<{ id: string; name: string; access_code_hash: string; is_active: boolean }>(
      "select id, name, access_code_hash, is_active from testers where access_code_lookup = $1 limit 1",
      [lookup],
    );
    const tester = rows[0];

    const matchesName = tester && tester.name.trim().toLowerCase() === identifier;
    const codeValid = tester ? verifyAccessCode(accessCode, tester.access_code_hash) : false;

    if (!tester || !matchesName || !codeValid || !tester.is_active) {
      await recordLoginAttempt(identifier, false);
      throw new AppError("UNAUTHENTICATED", "Name or access code is incorrect.");
    }

    await recordLoginAttempt(identifier, true);
    await createTesterSession(tester.id);
    return { testerId: tester.id };
  });
}

export async function testerLogoutAction() {
  return runAction(async () => {
    await destroyTesterSession();
    return null;
  });
}

export async function adminLoginAction(formData: FormData) {
  return runAction(async () => {
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    const password = String(formData.get("password") ?? "");
    if (!email || !password || email.length > 254 || password.length > 1024) {
      throw new AppError("UNAUTHENTICATED", "Email or password is incorrect.");
    }
    const identifier = `admin:${email}`;
    if (await isRateLimited(identifier)) {
      throw new AppError("FORBIDDEN", "Too many attempts. Please try again later.");
    }
    const { rows } = await query<{ id: string; password_hash: string }>(
      "select id, password_hash from admin_users where lower(email) = $1 limit 1",
      [email],
    );
    const admin = rows[0];
    let valid = false;
    if (admin) valid = await verifyPassword(password, admin.password_hash);
    else await hashPassword(password);
    await recordLoginAttempt(identifier, valid);
    if (!admin || !valid) throw new AppError("UNAUTHENTICATED", "Email or password is incorrect.");
    await createAdminSession(admin.id);
    return null;
  });
}

export async function adminLogoutAction() {
  return runAction(async () => {
    await destroyAdminSession();
    return null;
  });
}
