import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/adminClient";

const WINDOW_MINUTES = 15;
const MAX_ATTEMPTS = 8;

/**
 * DB-backed sliding-window rate limit, since Vercel's serverless instances don't share
 * in-memory state. Keyed by a caller-supplied identifier (e.g. normalized tester name).
 */
export async function isRateLimited(identifier: string): Promise<boolean> {
  const supabase = createSupabaseAdminClient();
  const since = new Date(Date.now() - WINDOW_MINUTES * 60 * 1000).toISOString();

  const { count } = await supabase
    .from("login_attempts")
    .select("id", { count: "exact", head: true })
    .eq("identifier", identifier)
    .eq("success", false)
    .gte("created_at", since);

  return (count ?? 0) >= MAX_ATTEMPTS;
}

export async function recordLoginAttempt(identifier: string, success: boolean): Promise<void> {
  const supabase = createSupabaseAdminClient();
  await supabase.from("login_attempts").insert({ identifier, success });
}
