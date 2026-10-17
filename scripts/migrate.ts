import { config } from "dotenv";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Pool } from "pg";

config({ path: resolve(process.cwd(), ".env.migration") });
config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env.production") });

const MIGRATIONS_DIR = resolve(process.cwd(), "db/migrations");
const LOCK_ID = 714185932;

async function main() {
  const files = (await readdir(MIGRATIONS_DIR))
    .filter((file) => /^\d+_[a-z0-9_-]+\.sql$/i.test(file))
    .sort();
  if (process.argv.includes("--dry-run")) {
    for (const file of files) console.log(file);
    return;
  }

  const connectionString = process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL;
  if (!connectionString) throw new Error("MIGRATION_DATABASE_URL or DATABASE_URL is not configured.");
  const pool = new Pool({ connectionString, max: 1, connectionTimeoutMillis: 5_000 });
  const client = await pool.connect();
  try {
    await client.query(
      "create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())",
    );
    await client.query("select pg_advisory_lock($1)", [LOCK_ID]);
    for (const file of files) {
      const { rows } = await client.query("select 1 from schema_migrations where name = $1", [file]);
      if (rows.length > 0) continue;
      const migration = await readFile(resolve(MIGRATIONS_DIR, file), "utf8");
      await client.query("begin");
      try {
        await client.query(migration);
        await client.query("insert into schema_migrations (name) values ($1)", [file]);
        await client.query("commit");
        console.log(`Applied ${file}`);
      } catch (error) {
        await client.query("rollback");
        throw error;
      }
    }
    console.log("Database migrations are current.");
  } finally {
    try {
      await client.query("select pg_advisory_unlock($1)", [LOCK_ID]);
    } finally {
      client.release();
      await pool.end();
    }
  }
}

main().catch((error: unknown) => {
  const code = typeof error === "object" && error !== null && "code" in error
    ? String((error as { code: unknown }).code)
    : undefined;
  console.error("Database migration failed.", code ? `PostgreSQL error code: ${code}` : "Check the database connection and migration SQL.");
  process.exitCode = 1;
});