import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/serverClient";
import { createSupabaseAdminClient } from "@/lib/supabase/adminClient";

export interface AdminIdentity {
  authUserId: string;
  email: string | null;
  name: string | null;
}

/** Returns the authenticated admin, or null if not signed in or not a recognized admin. */
export async function getAdminSession(): Promise<AdminIdentity | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const adminClient = createSupabaseAdminClient();
  const { data: adminRow } = await adminClient
    .from("admin_users")
    .select("auth_user_id, name")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!adminRow) return null;

  return { authUserId: user.id, email: user.email ?? null, name: adminRow.name };
}

/** Throws if there is no valid, authorized admin session. */
export async function requireAdminSession(): Promise<AdminIdentity> {
  const admin = await getAdminSession();
  if (!admin) throw new Error("UNAUTHORIZED");
  return admin;
}
