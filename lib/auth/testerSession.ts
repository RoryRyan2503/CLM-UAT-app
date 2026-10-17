import "server-only";
import { cookies } from "next/headers";
import { randomBytes, createHash } from "node:crypto";
import { query } from "@/lib/db/pool";
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

  await query(
    "insert into tester_sessions (tester_id, token_hash, expires_at) values ($1, $2, $3)",
    [testerId, hashToken(token), expiresAt],
  );

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
    await query(
      "update tester_sessions set revoked_at = now() where token_hash = $1 and revoked_at is null",
      [hashToken(token)],
    );
  }
  cookieStore.delete(TESTER_SESSION_COOKIE);
}

/** Returns the authenticated tester, or null. Does not redirect — callers decide how to react. */
export async function getTesterSession(): Promise<TesterIdentity | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(TESTER_SESSION_COOKIE)?.value;
  if (!token) return null;

  const { rows } = await query<TesterIdentity>(
    `select t.id, t.name, t.email, t.department, t.persona
     from tester_sessions s
     join testers t on t.id = s.tester_id
     where s.token_hash = $1 and s.revoked_at is null and s.expires_at > now() and t.is_active
     limit 1`,
    [hashToken(token)],
  );
  const tester = rows[0];
  if (!tester) return null;

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
