import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/types/database";

// Browser client uses the anon key only. RLS denies anon/authenticated access to every
// application table (see supabase/migrations/0001_init.sql); it exists solely so Supabase
// Auth (admin email/password sign-in) can run client-side and manage its own session cookies.
export function createSupabaseBrowserClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
