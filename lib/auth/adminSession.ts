import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { query } from "@/lib/db/pool";
import { ADMIN_SESSION_COOKIE } from "@/lib/constants";

export interface AdminIdentity {
  id: string;
  email: string;
  name: string | null;
}

const ADMIN_SESSION_TTL_HOURS = 8;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createAdminSession(adminId: string): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + ADMIN_SESSION_TTL_HOURS * 60 * 60 * 1000);
  await query(
    "insert into admin_sessions (admin_user_id, token_hash, expires_at) values ($1, $2, $3)",
    [adminId, hashToken(token), expiresAt],
  );
  const cookieStore = await cookies();
  cookieStore.set(ADMIN_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroyAdminSession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  if (token) {
    await query(
      "update admin_sessions set revoked_at = now() where token_hash = $1 and revoked_at is null",
      [hashToken(token)],
    );
  }
  cookieStore.delete(ADMIN_SESSION_COOKIE);
}

/** Returns the authenticated admin, or null if not signed in or not a recognized admin. */
export async function getAdminSession(): Promise<AdminIdentity | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  if (!token) return null;

  const { rows } = await query<AdminIdentity>(
    `select a.id, a.email, a.name
     from admin_sessions s
     join admin_users a on a.id = s.admin_user_id
     where s.token_hash = $1 and s.revoked_at is null and s.expires_at > now()
     limit 1`,
    [hashToken(token)],
  );
  return rows[0] ?? null;
}

/** Throws if there is no valid, authorized admin session. */
export async function requireAdminSession(): Promise<AdminIdentity> {
  const admin = await getAdminSession();
  if (!admin) throw new Error("UNAUTHORIZED");
  return admin;
}
