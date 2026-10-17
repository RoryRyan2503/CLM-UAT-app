import { config } from "dotenv";
import { resolve } from "node:path";
import { Pool } from "pg";
import { hashPassword } from "@/lib/auth/passwordHash";

config({ path: resolve(process.cwd(), ".env.bootstrap") });
config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env.production") });

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  const [rawEmail, ...nameParts] = process.argv.slice(2);
  const email = rawEmail?.trim().toLowerCase();
  const name = nameParts.join(" ").trim() || null;
  const password = process.env.ADMIN_BOOTSTRAP_PASSWORD;

  if (!databaseUrl) throw new Error("Set DATABASE_URL in .env.local or .env.production first.");
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    throw new Error('Usage: ADMIN_BOOTSTRAP_PASSWORD="..." npm run db:create-admin -- admin@example.com "Admin Name"');
  }
  if (!password || password.length < 14 || password.length > 1024) {
    throw new Error("Set ADMIN_BOOTSTRAP_PASSWORD to a unique password between 14 and 1024 characters.");
  }

  const pool = new Pool({ connectionString: databaseUrl, max: 1, connectionTimeoutMillis: 5_000 });
  try {
    const passwordHash = await hashPassword(password);
    await pool.query(
      "insert into admin_users (email, password_hash, name) values ($1, $2, $3)",
      [email, passwordHash, name],
    );
    console.log(`Created local admin ${email}. Sign in at /admin/login.`);
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  const code = typeof error === "object" && error !== null && "code" in error
    ? String((error as { code: unknown }).code)
    : undefined;
  console.error(code === "23505" ? "An admin with this email already exists." : "Admin creation failed.");
  process.exitCode = 1;
});
