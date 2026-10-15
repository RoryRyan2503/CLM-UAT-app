import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "@/lib/types/database";

// Server-side Supabase Auth client (anon key, cookie-bound). Used only to determine the
// signed-in admin's identity. All actual data access still goes through the service-role
// client in lib/supabase/adminClient.ts after an explicit authorization check.
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a Server Component without a mutable cookie store; middleware
            // already refreshes the session cookie on navigation, so this is safe to ignore.
          }
        },
      },
    },
  );
}
