"use server";

import { createSupabaseAdminClient } from "@/lib/supabase/adminClient";
import { createSupabaseServerClient } from "@/lib/supabase/serverClient";
import { createTesterSession, destroyTesterSession } from "@/lib/auth/testerSession";
import { hashAccessCodeForLookup, verifyAccessCode } from "@/lib/auth/accessCodes";
import { isRateLimited, recordLoginAttempt } from "@/lib/auth/rateLimit";
import { testerLoginSchema } from "@/lib/validation/tester";
import { AppError, runAction } from "@/lib/actionResult";

function getSafeCauseChain(error: unknown) {
  const causes: { name?: string; code?: string }[] = [];
  let current = error;

  for (let depth = 0; depth < 4 && current && typeof current === "object"; depth += 1) {
    const cause = current as { name?: unknown; code?: unknown; cause?: unknown };
    causes.push({
      name: typeof cause.name === "string" ? cause.name : undefined,
      code: typeof cause.code === "string" ? cause.code : undefined,
    });
    current = cause.cause;
  }

  return causes;
}

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

    const supabase = createSupabaseAdminClient();
    const lookup = hashAccessCodeForLookup(accessCode);
    const { data: tester } = await supabase
      .from("testers")
      .select("id, name, access_code_hash, is_active")
      .eq("access_code_lookup", lookup)
      .maybeSingle();

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
    const email = String(formData.get("email") ?? "");
    const password = String(formData.get("password") ?? "");
    if (!email || !password) throw new AppError("VALIDATION", "Email and password are required.");

    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      const cause = error.cause as { code?: string } | undefined;
      const causeCode = cause?.code?.toUpperCase();
      if (
        causeCode === "UNABLE_TO_GET_ISSUER_CERT_LOCALLY" ||
        causeCode === "SELF_SIGNED_CERT_IN_CHAIN" ||
        causeCode === "CERTIFICATE_VERIFY_FAILED"
      ) {
        throw new AppError(
          "UNAUTHENTICATED",
          "The Next.js server cannot validate Supabase's HTTPS certificate through the corporate network. Ask IT for the corporate root CA in PEM format, then set NODE_EXTRA_CA_CERTS to that file path before starting npm run dev. Do not disable TLS certificate checks.",
        );
      }

      const messageByCode: Record<string, string> = {
        email_not_confirmed: "This Supabase Auth user is not confirmed. Confirm the user in Supabase Authentication → Users, then try again.",
        invalid_credentials: "Supabase rejected these credentials. Check that the user exists in the same Supabase project configured in .env.local and use that user's Supabase Auth password.",
        user_not_found: "No Supabase Auth user was found for this email in the configured project.",
        email_provider_disabled: "Email/password sign-in is disabled for this Supabase project. Enable it under Authentication → Providers.",
        user_banned: "This Supabase Auth user is disabled or banned. Check its status under Authentication → Users.",
        over_request_rate_limit: "Too many sign-in attempts. Wait a few minutes and try again.",
      };
      if (error.message.toLowerCase().includes("fetch failed")) {
        console.error("Supabase Auth sign-in request failed", {
          authCode: error.code,
          status: error.status,
          causeChain: getSafeCauseChain(error),
        });
      }
      throw new AppError(
        "UNAUTHENTICATED",
        messageByCode[error.code ?? ""] ??
          (error.message.toLowerCase().includes("fetch failed")
            ? "The sign-in request to Supabase failed. Check the Next.js server log for its network diagnostic code."
            : `Supabase sign-in failed (HTTP ${error.status || "unknown"}).`),
      );
    }

    const { data: adminRow, error: adminError } = await createSupabaseAdminClient()
      .from("admin_users")
      .select("id")
      .eq("auth_user_id", data.user.id)
      .maybeSingle();

    if (adminError || !adminRow) {
      await supabase.auth.signOut();
      throw new AppError(
        "FORBIDDEN",
        "Credentials are valid, but this user is not registered as an admin. Add its Auth user UUID to public.admin_users.",
      );
    }

    return null;
  });
}

export async function adminLogoutAction() {
  return runAction(async () => {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
    return null;
  });
}
