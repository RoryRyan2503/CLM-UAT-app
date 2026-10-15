import "server-only";
import { cookies } from "next/headers";
import { randomBytes, createHash } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/adminClient";
import { TESTER_SESSION_COOKIE, TESTER_SESSION_TTL_DAYS } from "@/lib/constants";

export interface TesterIdentity {
  id: string;
  name: string;
  email: string | null;
  department: string | null;
  persona: string | null;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createTesterSession(testerId: string): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + TESTER_SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from("tester_sessions").insert({
    tester_id: testerId,
    token_hash: hashToken(token),
    expires_at: expiresAt.toISOString(),
  });
  if (error) throw new Error("Failed to create session.");

  const cookieStore = await cookies();
  cookieStore.set(TESTER_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroyTesterSession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(TESTER_SESSION_COOKIE)?.value;
  if (token) {
    const supabase = createSupabaseAdminClient();
    await supabase
      .from("tester_sessions")
      .update({ revoked_at: new Date().toISOString() })
      .eq("token_hash", hashToken(token));
  }
  cookieStore.delete(TESTER_SESSION_COOKIE);
}

/** Returns the authenticated tester, or null. Does not redirect — callers decide how to react. */
export async function getTesterSession(): Promise<TesterIdentity | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(TESTER_SESSION_COOKIE)?.value;
  if (!token) return null;

  const supabase = createSupabaseAdminClient();
  const { data: session } = await supabase
    .from("tester_sessions")
    .select("tester_id, expires_at, revoked_at")
    .eq("token_hash", hashToken(token))
    .maybeSingle();

  if (!session || session.revoked_at) return null;
  if (new Date(session.expires_at).getTime() < Date.now()) return null;

  const { data: tester } = await supabase
    .from("testers")
    .select("id, name, email, department, persona, is_active")
    .eq("id", session.tester_id)
    .maybeSingle();

  if (!tester || !tester.is_active) return null;

  return {
    id: tester.id,
    name: tester.name,
    email: tester.email,
    department: tester.department,
    persona: tester.persona,
  };
}

/** Throws if there is no valid tester session. Use in server actions / data loaders that require auth. */
export async function requireTesterSession(): Promise<TesterIdentity> {
  const tester = await getTesterSession();
  if (!tester) throw new Error("UNAUTHENTICATED");
  return tester;
}
