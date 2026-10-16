# CLM Vendor UAT — Ironclad vs. Sirion

A production-ready MVP for running paired user acceptance testing between Ironclad and Sirion,
built with Next.js (App Router, TypeScript), Tailwind CSS, hand-authored shadcn/ui-style
components (Radix primitives), Supabase (PostgreSQL + Storage), and SheetJS for Excel
import/export.

Excel is used **only** to import the source test definitions and to export results. The live
system of record is Supabase PostgreSQL.

## 1. Source workbook

The source workbook is kept locally and intentionally excluded from this repository because
the imported definitions are already stored in Supabase. To re-import or seed another project,
provide your local workbook path to the seed command. The workbook's
`User Test Results` worksheet has five leading metadata rows (Tester Name, Department, Persona,
Record/Contract ID, Test Date) and a blank row before the real header. The importer locates the
header by signature, not by row number, so it works for this workbook and for a plain CSV export
of the same sheet. Only these seven columns are imported as canonical test definitions:

`Test Case ID, Functional Area, Persona, Scenario, Suggested Steps, Expected Result, Required Evidence`

The remaining columns in the source sheet (Actual Result, Status, Grade, Severity, Evidence
Link/File, Defect/Issue ID, Workaround/Notes) are a paper-based result template and are **not**
imported — results are captured per tester/vendor in the app instead. The original workbook is
never modified.

## 2. Tech stack

- Next.js 16 (App Router, TypeScript, Turbopack), React 19
- Tailwind CSS v4 + hand-authored shadcn/ui-style components on Radix primitives
  (the `shadcn` CLI could not run on this network due to a TLS-inspecting proxy; the component
  source files are vendored directly instead — see `components/ui/`)
- Supabase PostgreSQL (schema in `supabase/migrations/`) + Supabase Storage (private `evidence`
  bucket) via `@supabase/supabase-js` and `@supabase/ssr`
- Zod for shared client/server validation
- SheetJS (`xlsx`, installed from the vendored tarball in `vendor/` — the public npm `xlsx`
  package has unpatched advisories; SheetJS ships patched builds from their own site) for
  import/export
- Vitest for unit tests

### Why no Prisma

The brief allows "Prisma **or** Supabase client". This project uses the Supabase JS client
directly against hand-authored types in `lib/types/database.ts`, keeping one fewer moving part
(no separate ORM migration engine) since Supabase's own SQL migrations already own the schema.

## 3. Architecture & security notes

- **Two separate auth paths.** Admins sign in with Supabase Auth (email/password); only users
  present in the `admin_users` table are treated as admins. Testers sign in with name + a
  generated access code; only a salted hash is stored (`access_code_hash`, scrypt) plus a
  separate **keyed HMAC lookup hash** (`access_code_lookup`, pepper from `ACCESS_CODE_PEPPER`)
  for O(1) indexed lookup without storing the code in a reversible form. Tester sessions are an
  opaque random token in a `Secure, HttpOnly, SameSite=Lax` cookie; only its SHA-256 hash is
  stored server-side, with expiry and revocation.
- **Deny-by-default RLS.** Every table has Row Level Security enabled with **no** policies
  granted to `anon`/`authenticated`. All application reads/writes go through Next.js server
  code (Server Components, Server Actions, Route Handlers) using the Supabase **service role**
  key, which bypasses RLS. Authorization — tester ownership, admin role — is enforced in
  application code (`lib/auth/*`, `lib/data/*`) before any query runs. This avoids relying on
  `auth.uid()`-based policies, which don't apply to testers (they don't use Supabase Auth).
  The service-role client (`lib/supabase/adminClient.ts`) is guarded with `import "server-only"`
  so it can never be bundled into client code.
- **Optimistic concurrency.** `test_results` and `comparisons` carry a `version` integer. Saves
  include the version the client last saw; the update is conditioned on `version = <that value>`
  and bumps it by one. If no row matches (someone else saved first), the server returns a
  `CONFLICT` instead of silently overwriting.
- **Evidence uploads.** Files go directly from the browser to a private Supabase Storage bucket
  using a short-lived signed upload URL generated server-side after an ownership check; viewing
  evidence uses a short-lived signed read URL, also generated after an ownership/role check.
- **Rate limiting.** Tester login attempts are recorded in `login_attempts` and rate-limited
  per-identifier via a DB-backed sliding window (works correctly across Vercel's stateless
  serverless instances, unlike an in-memory limiter).

## 4. Local setup

```bash
npm install
cp .env.example .env.local
```

Fill in `.env.local`:

| Variable | Where to find it |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project → Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase project → Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase project → Settings → API (keep secret, server-only) |
| `ACCESS_CODE_PEPPER` | `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |

### Supabase configuration

1. Create a Supabase project.
2. Run the migrations in order against it (SQL editor, or `supabase db push` if you have the
   Supabase CLI linked to the project):
   - `supabase/migrations/0001_init.sql` — schema, constraints, triggers, RLS (deny-by-default).
   - `supabase/migrations/0002_storage.sql` — creates the private `evidence` Storage bucket.
  - `supabase/migrations/0003_result_usability_questions.sql` — adds nullable per-vendor usability answers.
  - `supabase/migrations/0004_persona_assignments.sql` — adds reusable personas, persona-case defaults, tester persona links, and soft-removable assignments. Existing assignment rows default active; no results are deleted or reset.
  - `supabase/migrations/0005_evidence_setting.sql` — adds the Admin-controlled evidence collection setting. Evidence becomes optional for Pass/Fail, and disabling the setting hides controls and blocks new uploads without deleting existing evidence.
3. Run `supabase/seed.sql` (or let `npm run db:seed` do it) to seed the two vendors.
4. Create an admin:
   ```bash
   npm run db:create-admin -- "admin@example.com" "a-strong-password" "Admin Name"
   ```
   This creates a Supabase Auth user and links it in `admin_users`.

> Local `supabase start` (Dockerized Postgres) isn't available in every environment. The
> migrations are plain SQL and apply cleanly to any hosted Supabase project via the SQL editor
> or `supabase db push` after `supabase link`.

### Import the test cases

```bash
npm run db:seed -- "C:/path/to/Honeywell_CLM_UAT_Tester_Draft.xlsx"
```

This re-seeds the vendors and imports/updates the test case definitions from the workbook
(idempotent by `Test Case ID` — safe to re-run after editing the sheet). You can also import
from **Admin → Import** in the running app, which previews the parsed rows (with row-level
errors and duplicate-ID detection) before committing.

### Create testers and manage persona assignments

1. Sign in at `/admin/login`.
2. **Admin → Testers → Add tester.** The generated access code is shown once — copy it to share
   with the tester; it cannot be retrieved again (only reset).
3. In **Admin → Assignments**, add or select a persona and select its default cases. Set each
  tester's persona, then use **Apply persona defaults** to add the defaults without removing
  any existing assignments.
4. Select a tester to review and adjust their exact case list. Filter by functional area, select
  all visible cases, and save additions/removals. Every active case creates an Ironclad and a
  Sirion assignment. Removing a case hides it from the tester workspace using a soft-disable;
  existing results, drafts, evidence, and history remain stored and are restored if reassigned.

### Run the app

```bash
npm run dev
```

- Testers sign in at `/login` (name + access code).
- Admins sign in at `/admin/login` (Supabase Auth email/password).

### Tests

```bash
npm test
```

Covers conditional result validation (Fail/Blocked/Pass completion rules, Critical flagging),
access-code hashing/verification, and the workbook/CSV header-detection + import parser
(including duplicate-ID and malformed-row handling). Full authorization/RLS and optimistic
concurrency behavior is best verified against a real Supabase project (see "Supabase
configuration" above); the deny-by-default RLS policies and ownership checks in `lib/data/*`
are what enforce that testers can only edit their own records.

`npm audit --omit=dev` reports 0 vulnerabilities; devDependencies (vitest's bundled mocker) have
open advisories but are dev-only tooling, never shipped to production.

## 5. Deploying to Vercel

1. Push this repository to GitHub/GitLab/Bitbucket and import it into Vercel.
2. Add the same environment variables from `.env.local` in the Vercel project settings
   (Production and Preview).
3. Deploy. The app has no server-side build-time dependency on Supabase (all Supabase calls are
   lazy, inside request handlers), so builds succeed even before the database is configured —
   just make sure the env vars are set before traffic hits the app.
4. Re-run `npm run db:seed` / `npm run db:create-admin` locally (pointed at the same project via
   `.env.local`) whenever you need to import/re-import test cases or create another admin.

## 6. On-premises Windows Server deployment

For the first phase, see [docs/windows-app-hosted-supabase.md](docs/windows-app-hosted-supabase.md) to run the Next.js app on Windows Server while keeping PostgreSQL, Auth, and evidence Storage in the existing hosted Supabase project. This does not move UAT data or evidence on-premises.

For the later full on-premises target, see [docs/on-prem-windows.md](docs/on-prem-windows.md), which covers Supabase in a Linux VM under Hyper-V. If the server must remain Windows-only, [docs/windows-postgresql-migration.md](docs/windows-postgresql-migration.md) describes the larger refactor required to replace Supabase with native PostgreSQL, local Admin authentication, and local evidence storage.

## 7. Project structure

```
app/                       Routes (tester + admin), Server Actions, API route handlers
components/                Shared UI (components/ui = shadcn-style primitives) and feature components
lib/auth/                  Tester session + access-code hashing, admin role checks, rate limiting
lib/data/                  All Supabase queries/mutations (authorization enforced here)
lib/import/, lib/export/   SheetJS workbook parsing and XLSX generation
lib/validation/            Zod schemas + conditional completion rules (shared client/server)
lib/types/database.ts      Hand-authored Supabase types
lib/supabase/              Browser/server/service-role Supabase clients
supabase/migrations/       SQL schema + RLS + storage bucket
supabase/seed.sql          Vendor seed
scripts/                   db:seed (workbook import) and db:create-admin
tests/                     Vitest unit tests
```
