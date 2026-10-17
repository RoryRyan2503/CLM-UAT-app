# CLM Vendor UAT — Ironclad vs. Sirion

An internal user-acceptance-testing application built with Next.js, PostgreSQL, local
administrator authentication, and private filesystem evidence storage. Supabase is no longer
used by the application runtime.

## 1. Source workbook

The source workbook is kept locally and intentionally excluded from this repository. To import
or re-import definitions, provide its path to the seed command. The workbook's
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
- Native PostgreSQL via `pg`; schema migrations live in `db/migrations/`
- Admin passwords use Node.js `scrypt`; tester sessions and admin sessions are opaque,
  database-backed cookies
- Evidence files are stored outside the web root and served only by authenticated routes
- Zod for shared client/server validation
- SheetJS (`xlsx`, installed from the vendored tarball in `vendor/` — the public npm `xlsx`
  package has unpatched advisories; SheetJS ships patched builds from their own site) for
  import/export
- Vitest for unit tests

The app uses parameterized SQL through `pg` to avoid shipping an ORM or a separate API service.

## 3. Architecture & security notes

- **Two separate auth paths.** Admins sign in with a local email/password account; salted
  `scrypt` hashes are stored in `admin_users`. Testers sign in with name + a
  generated access code; only a salted hash is stored (`access_code_hash`, scrypt) plus a
  separate **keyed HMAC lookup hash** (`access_code_lookup`, pepper from `ACCESS_CODE_PEPPER`)
  for O(1) indexed lookup without storing the code in a reversible form. Tester sessions are an
  opaque random token in a `Secure, HttpOnly, SameSite=Lax` cookie; only its SHA-256 hash is
  stored server-side, with expiry and revocation.
- **Database boundary.** PostgreSQL listens on loopback/private interfaces and is never
  reachable from browsers. The Node process uses a restricted runtime role; all inputs are
  parameterized, and application ownership/admin checks happen on the server before queries.
- **Optimistic concurrency.** `test_results` and `comparisons` carry a `version` integer. Saves
  include the version the client last saw; the update is conditioned on `version = <that value>`
  and bumps it by one. If no row matches (someone else saved first), the server returns a
  `CONFLICT` instead of silently overwriting.
- **Evidence uploads.** Authenticated Server Actions validate file size/type and tester ownership,
  store generated file keys outside the web root, and record metadata in PostgreSQL. Downloads
  require an active tester session or admin session and are sent as attachments.
- **Rate limiting.** Tester login attempts are recorded in `login_attempts` and rate-limited
  per-identifier via a DB-backed sliding window (works correctly across Vercel's stateless
  serverless instances, unlike an in-memory limiter).

## 4. Local setup

```bash
npm install
cp .env.example .env.local
```

Install PostgreSQL locally, create a database and role, then set `.env.local`:

| Variable | Where to find it |
| --- | --- |
| `DATABASE_URL` | Native PostgreSQL runtime-role connection string |
| `MIGRATION_DATABASE_URL` | Optional elevated migration-role connection string; set only while migrating |
| `EVIDENCE_STORAGE_DIR` | Absolute private evidence directory outside the app/web root |
| `ACCESS_CODE_PEPPER` | `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `ADMIN_BOOTSTRAP_PASSWORD` | Temporary value used only by `npm run db:create-admin` |

Apply the native schema and seed data:

```powershell
npm run db:migrate
npm run db:seed -- "C:/path/to/Honeywell_CLM_UAT_Tester_Draft.xlsx"
$env:ADMIN_BOOTSTRAP_PASSWORD = '<strong unique password>'
npm run db:create-admin -- admin@example.com "Admin Name"
Remove-Item Env:ADMIN_BOOTSTRAP_PASSWORD
```

Use `MIGRATION_DATABASE_URL` with a schema-owner credential for migrations. The running app
should use only the restricted `DATABASE_URL` role. Do not keep the migration credential in the
Windows service environment. Do not commit `.env.local` or the password.

### Import the test cases

```bash
npm run db:seed -- "C:/path/to/Honeywell_CLM_UAT_Tester_Draft.xlsx"
```

This seeds the vendors and imports/updates the test case definitions from the workbook
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
- Admins sign in at `/admin/login` (local email/password).

### Tests

```bash
npm test
```

The suite covers password hashing, access-code hashing, workbook parsing, and result validation.
Run integration tests against a real PostgreSQL instance before production cutover; the local
workspace does not include a PostgreSQL service.

## 6. On-premises Windows Server deployment

For Windows Server 2022 setup, data/file migration, service identity, backup, test, and rollback
steps, see [docs/windows-postgresql-migration.md](docs/windows-postgresql-migration.md). The
hosted-Supabase and self-hosted-Supabase guides describe superseded architectures.

## 7. Project structure

```
app/                       Routes (tester + admin), Server Actions, API route handlers
components/                Shared UI (components/ui = shadcn-style primitives) and feature components
lib/auth/                  Tester session + access-code hashing, admin role checks, rate limiting
lib/data/                  Parameterized PostgreSQL queries (authorization enforced here)
lib/import/, lib/export/   SheetJS workbook parsing and XLSX generation
lib/validation/            Zod schemas + conditional completion rules (shared client/server)
lib/types/database.ts      Shared database row types
db/migrations/             Native PostgreSQL schema and migration runner
supabase/migrations/       Historical hosted schema retained for migration reference
scripts/                   db:migrate, db:seed, and db:create-admin
tests/                     Vitest unit tests
```
