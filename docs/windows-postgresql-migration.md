# Native PostgreSQL on Windows Server: setup and application migration

## Important: PostgreSQL is not a drop-in Supabase replacement

The current app does not speak the PostgreSQL wire protocol. It uses `@supabase/supabase-js` to call Supabase's REST/database API and uses Supabase Auth and Supabase Storage. Changing `.env.local` to a PostgreSQL connection string will not work.

A native Windows PostgreSQL deployment is viable, but it requires replacing three things:

1. Supabase database queries with parameterized SQL using the Node.js `pg` driver.
2. Supabase Auth for Admins with app-managed Admin accounts and sessions. Tester access-code authentication already belongs to the app, but its database calls must be converted.
3. Supabase Storage with protected local file storage and authenticated upload/download endpoints (or another approved on-prem file service).

Do not point the current production app at the PostgreSQL server until this refactor is complete and tested. Keep the existing Supabase project as the live system and migration source until cutover is approved.

## Architecture on one Windows Server

```text
Tester/admin browsers
        | HTTPS 443
        v
IIS reverse proxy + TLS
        |
        +--> Next.js Node service (127.0.0.1:3000)
        |       | PostgreSQL TCP via loopback
        |       +--> Evidence files in a private data directory
        |
        +--> PostgreSQL Windows service (127.0.0.1:5432)
```

Browsers contact only the HTTPS app. They must never connect directly to PostgreSQL or the evidence directory. PostgreSQL and the evidence directory should be on persistent storage and included in separate, tested backup/restore procedures.

## Phase 1: verify Windows Server capacity and approval

Before installing software, ask IT to confirm Windows Server 2022 is patched, that you have permission to install a Windows service, and that IIS/HTTPS and backups are approved. For this small UAT app, use 4 CPU cores, 8 GB RAM, and 50 GB free SSD as an initial planning baseline, then add room for the database, evidence, logs, and backups. These are not benchmarked capacity guarantees; measure after pilot usage.

Run this read-only inventory in PowerShell on the actual server:

```powershell
Get-ComputerInfo | Select-Object WindowsProductName, WindowsVersion, OsBuildNumber
Get-CimInstance Win32_ComputerSystem | Select-Object NumberOfLogicalProcessors, @{Name='RAM_GB';Expression={[math]::Round($_.TotalPhysicalMemory / 1GB, 1)}}
Get-Volume | Select-Object DriveLetter, FileSystemLabel, @{Name='Size_GB';Expression={[math]::Round($_.Size / 1GB, 1)}}, @{Name='Free_GB';Expression={[math]::Round($_.SizeRemaining / 1GB, 1)}}
```

Share only the OS version, RAM, CPU count, and free disk space when reviewing capacity; omit hostnames, IP addresses, usernames, and passwords.

## Phase 2: install PostgreSQL as a Windows service

1. Download the current supported PostgreSQL Windows installer through the [official PostgreSQL Windows download page](https://www.postgresql.org/download/windows/), which links to the EDB installer. For Windows Server 2022, PostgreSQL 17 or 18 is supported by the current Windows platform matrix. Choose the latest patched minor release in a major version approved by IT; PostgreSQL 17 is a conservative starting point if IT prefers a longer-established major version.
2. Verify the installer source and signature according to IT policy. On the component screen, install **PostgreSQL Server** and **Command Line Tools** (`psql`, `pg_dump`, `pg_restore`). pgAdmin is optional. StackBuilder is not required for this app.
3. Choose an IT-approved install directory and a persistent data directory. If a separate data SSD exists, place the data directory there, e.g. `D:\PostgreSQL\data`, not in a user profile, OneDrive, or the application directory.
4. Use port `5432` unless IT has an approved port plan. Set a unique strong password for the built-in PostgreSQL `postgres` administrator. Do not reuse the Windows password. Store it in the corporate password manager; never put it in source control or chat.
5. Finish setup and confirm the PostgreSQL service is set to Automatic and running in `services.msc`. Use a current pgAdmin or `psql` client to connect locally.
6. Keep PostgreSQL listening on loopback only. In `postgresql.conf`, verify `listen_addresses = 'localhost'`. Keep `pg_hba.conf` limited to loopback entries using `scram-sha-256`; do not add `0.0.0.0/0`, `trust`, or broad subnet rules. The PostgreSQL default is loopback-only. Do not create an inbound Windows Firewall rule for port 5432.
7. Keep PostgreSQL patched under IT change control. Back up the database with `pg_dump`/`pg_restore` or an approved PostgreSQL backup tool, and test restoring to a clean database. A VM snapshot alone is not a database backup.

Official references: [PostgreSQL Windows installers](https://www.postgresql.org/download/windows/), [connection settings](https://www.postgresql.org/docs/current/runtime-config-connection.html), and [client authentication / pg_hba.conf](https://www.postgresql.org/docs/current/auth-pg-hba-conf.html).

## Phase 3: create a database and restricted app role

Use pgAdmin Query Tool connected as the PostgreSQL administrator, or `psql`. The following is a template, not a command to execute until the code migration is ready:

```sql
CREATE ROLE clm_uat_app
  LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
CREATE DATABASE clm_uat OWNER postgres ENCODING 'UTF8';
```

Set the role password interactively with `\password clm_uat_app` in `psql`; do not store a plaintext password in a `.sql` file or shell history. Connect to `clm_uat` as the migration administrator, then apply the native PostgreSQL schema migrations. The migration administrator owns schema changes; the app login must not be a superuser, database owner, or schema owner.

After applying the schema, grant only the runtime privileges the app requires. For this app that will generally include `CONNECT`, schema `USAGE`, DML on its tables, and sequence access. Add default privileges for future tables/sequences created by the migration owner. Do not grant the runtime role `CREATE`, `CREATEDB`, `CREATEROLE`, or superuser rights.

The app's current Supabase migrations cannot be applied unchanged:

- `0001_init.sql` references `auth.users` in `admin_users` and enables RLS on tables.
- `0002_storage.sql` inserts into Supabase's `storage.buckets` schema.
- `0003` through `0005` contain PostgreSQL schema changes, but must be integrated into a new ordered native migration set and tested against the chosen PostgreSQL version.
- RLS currently denies browser roles and is bypassed by Supabase's service-role key. A plain PostgreSQL login will not inherit that behavior. The native schema must remove/replace those RLS declarations or add a deliberately designed per-user RLS context. The simpler design for this app is private loopback-only PostgreSQL access, a least-privilege app role, and strict tester/admin ownership checks in the server data layer. Never expose the app DB role to a browser.

Create a new directory such as `db/migrations/` for native PostgreSQL migrations. Keep the Supabase migration files intact for the existing hosted project until cutover is finished; do not rewrite them in place.

## Phase 4: required application changes

### Database/data access

- Add the `pg` package and `@types/pg`, and create one server-only `pg.Pool` module using a server-only `DATABASE_URL`.
- Rewrite the 15 modules under `lib/data/` and the DB-backed login rate limiter to use parameterized SQL (`$1`, `$2`, ...), not string interpolation. Cover tester management, assignment/persona queries, dashboards, test workflows, results, comparisons, defects, evidence metadata, settings, audits, imports, and exports.
- Reproduce current Supabase query behavior explicitly: embedded relation joins, `maybeSingle`, counts, upserts, optimistic `version` checks, and returned records. Add transactions for operations that update a result and its history together, and for multi-row assignment/import work.
- Replace or generate the handwritten `Database` types to match the native schema. Use typed row interfaces for query results and validate Server Action inputs as today.
- Retain all existing ownership checks and Admin authorization. Every query using IDs from a form/action must verify that the authenticated user may access that record. Use parameterized SQL everywhere.

### Admin authentication

- Replace `supabase.auth.signInWithPassword`, `signOut`, and `getUser` with a local `admin_users` account table containing a normalized unique email, password hash, active flag, and display name.
- Hash Admin passwords using a modern password-hashing function (prefer Argon2id through a maintained library; alternatively use Node's built-in `scrypt` with a unique random salt and a carefully reviewed encoding/verification implementation). Never store a plaintext password.
- Implement login throttling, generic invalid-credential messages, session expiry/revocation, and a random opaque HttpOnly/Secure/SameSite cookie whose token is stored only as a hash in a session table. Protect account creation/reset so only an authorized operator can create or reset an Admin.
- Replace `lib/auth/adminSession.ts`, the Admin login/logout actions, `scripts/createAdmin.ts`, and Supabase session-refresh middleware. Remove Supabase Auth references from the Admin layout/login flow.
- The existing `admin_users.auth_user_id` foreign key must be removed. Provide a script to bootstrap the first Admin securely, then use the Admin UI for subsequent management if needed.

### Evidence storage

- Recommended for a single Windows host: store binary evidence on disk outside the web root (e.g. `D:\CLM-UAT-Data\evidence`) and store only a random relative file key plus metadata in PostgreSQL. Do not use an untrusted original filename as a path.
- Replace direct browser Supabase Storage calls in `components/evidence-manager.tsx` with authenticated app endpoints for upload and download. Upload and download handlers must verify tester ownership or Admin role, enforce file-size and allowed-type limits, use generated filenames, and prevent path traversal. Stream downloads only after authorization; do not serve the data directory as static files.
- Ensure only the Windows service account and approved administrators can read the evidence directory. Include both PostgreSQL backups and the evidence directory in the backup policy; they must be restored as a consistent pair.
- Preserve the existing Admin setting: disabled evidence hides the form and rejects new evidence requests; existing database metadata/files remain readable by authorized users. Evidence remains optional when enabled.

### Configuration, middleware, and scripts

- Replace `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` with server-only database and evidence-storage settings, for example `DATABASE_URL` and `EVIDENCE_STORAGE_DIR`.
- Keep `ACCESS_CODE_PEPPER` server-only. Preserve its production value if you want existing tester access-code hashes to continue working.
- Remove `@supabase/supabase-js` and `@supabase/ssr` only after all usage is gone. Rewrite `scripts/seed.ts`, `scripts/createAdmin.ts`, and import logic to use the native DB adapter.
- Ensure the Next.js middleware/proxy no longer instantiates Supabase clients. Verify no browser bundle contains database credentials or filesystem paths.

## Phase 5: schema/data migration and cutover

Do this first against a staging PostgreSQL database. Keep hosted Supabase as the authoritative production system until the rehearsal passes.

1. Make a verified hosted database backup and record row counts for testers, test cases, assignments, results, evidence metadata, defects, comparisons, result history, settings, and imports.
2. Export PostgreSQL data using a Supabase-supported backup/dump procedure approved for your project. Restore into a staging native PostgreSQL database; resolve Supabase-owned schemas, extensions, grants, and migration-specific objects explicitly. Do not assume a raw SQL dump restores cleanly to plain PostgreSQL.
3. Migrate all file objects from Supabase Storage to the protected Windows evidence directory and verify every evidence metadata row maps to a file. Database rows alone do not contain the binary files.
4. Admin users need a deliberate migration plan: recreate Admins and reset their passwords, or migrate password hashes only if a tested process is approved. Preserve tester rows and `ACCESS_CODE_PEPPER` if retaining existing tester access codes. Revoke or expire old sessions so everyone signs in again.
5. Apply the native migration set, grant runtime privileges, run the refactored app against staging, and test Admin/tester login, rate limiting, assignment ownership, drafts/submits, history, comparisons, defects, evidence upload/view, import/export, and evidence on/off settings.
6. Test full restore of the native PostgreSQL database and evidence directory to a clean location. Check counts and sample evidence downloads after restore.
7. At cutover, schedule a maintenance window, stop tester writes, take final database and evidence backups, restore final changes, run smoke tests, then change the production service to the native database. Preserve the hosted project read-only for an agreed rollback period.
8. Do not delete the hosted project until business owners sign off on the new system and a rollback/restore test has passed.

## Suggested implementation order

1. Install PostgreSQL and verify it is local-only; this does not yet change the running app.
2. Create and test native schema migrations in a separate database.
3. Implement the `pg` adapter and convert the data/auth/storage modules in small slices with tests.
4. Run the complete app against a staging native database and local evidence directory.
5. Rehearse data and file migration, backups, restore, and cutover.
6. Deploy behind IIS with HTTPS; allow inbound 443 only from approved user networks, and keep 5432 inaccessible remotely.

This is a substantial but manageable refactor. A sensible first implementation milestone is a feature branch that adds the native migration set and a `pg` connection pool, then converts one read-only data module and validates it against a local PostgreSQL instance before touching authentication or evidence.
