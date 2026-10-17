import "server-only";
import { query } from "@/lib/db/pool";

const WINDOW_MINUTES = 15;
const MAX_ATTEMPTS = 8;

/**
 * DB-backed sliding-window rate limit, since Vercel's serverless instances don't share
 * in-memory state. Keyed by a caller-supplied identifier (e.g. normalized tester name).
 */
export async function isRateLimited(identifier: string): Promise<boolean> {
  const { rows } = await query<{ count: string }>(
    `select count(*)::text as count from login_attempts
     where identifier = $1 and success = false
       and created_at >= now() - ($2::int * interval '1 minute')`,
    [identifier, WINDOW_MINUTES],
  );
  return Number(rows[0]?.count ?? 0) >= MAX_ATTEMPTS;
}

export async function recordLoginAttempt(identifier: string, success: boolean): Promise<void> {
  await query("insert into login_attempts (identifier, success) values ($1, $2)", [identifier, success]);
}
