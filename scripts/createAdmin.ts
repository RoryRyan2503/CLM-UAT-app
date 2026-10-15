/**
 * Creates a Supabase Auth user and marks them as an admin (admin_users table).
 * Usage: npm run db:create-admin -- admin@example.com "strong-password" "Admin Name"
 */
import { config } from "dotenv";
import { resolve } from "node:path";

config({ path: resolve(process.cwd(), ".env.local") });

import { createClient } from "@supabase/supabase-js";

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local first.");
  }

  const [email, password, name] = process.argv.slice(2);
  if (!email || !password) {
    throw new Error('Usage: npm run db:create-admin -- "email@example.com" "password" "Admin Name"');
  }

  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

  const { data: created, error: createError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createError) throw createError;

  const { error: linkError } = await supabase
    .from("admin_users")
    .insert({ auth_user_id: created.user.id, name: name ?? null });
  if (linkError) throw linkError;

  console.log(`Created admin user ${email}. Sign in at /admin/login.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
