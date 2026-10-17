# Native Windows Server deployment and Supabase cutover

The app runtime now uses native PostgreSQL, local administrator accounts, and local evidence
files. It no longer calls Supabase for authentication, database queries, or storage. The hosted
Supabase project remains the migration source until a rehearsed cutover is approved.

```text
Browsers --HTTPS--> IIS --loopback--> Next.js/Node service
                                      |-- loopback TCP --> PostgreSQL Windows service
                                      `-- private disk --> evidence directory
```

Browsers must not connect to PostgreSQL or the evidence directory. Keep PostgreSQL bound to
loopback and evidence outside the application folder/web root. No Hyper-V, Docker, Linux VM,
Redis, or separate object-storage service is needed for this single-server design.

## 1. Check server capacity

The app is small, but actual capacity depends on concurrent testers, workbook sizes, database
growth, and evidence retention. Do not treat a generic RAM estimate as a guarantee. Inventory
the actual Windows Server before installing anything:

```powershell
Get-ComputerInfo | Select-Object WindowsProductName, WindowsVersion, OsBuildNumber
Get-CimInstance Win32_ComputerSystem | Select-Object NumberOfLogicalProcessors, @{Name='RAM_GB';Expression={[math]::Round($_.TotalPhysicalMemory / 1GB, 1)}}
Get-Volume | Select-Object DriveLetter, FileSystemLabel, @{Name='Size_GB';Expression={[math]::Round($_.Size / 1GB, 1)}}, @{Name='Free_GB';Expression={[math]::Round($_.SizeRemaining / 1GB, 1)}}
```

Measure idle and peak memory/disk after the staging pilot. The app currently caps each evidence
upload at 10 MB; agree retention and backup capacity separately from application storage.

## 2. Install and restrict PostgreSQL

1. Download a supported PostgreSQL Windows installer from the official
   [PostgreSQL Windows download page](https://www.postgresql.org/download/windows/) and verify
   it under your organization's software policy. Install PostgreSQL Server and Command Line
   Tools (`psql`, `pg_dump`, `pg_restore`); pgAdmin is optional.
   If the interactive EDB installer fails or is blocked, that same official page links an EDB
   ZIP archive of PostgreSQL binaries for advanced users. Use a patched PostgreSQL 17 or 18
   release (both are listed as tested on Windows Server 2022), extract it to a fixed folder,
   initialize the data directory with `initdb`, and register it as a Windows service with a
   dedicated non-admin service identity. Do not leave the service running as LocalSystem. Have
   IT provision the service identity, grant it access to the data/log directories, and approve
   the service registration. The ZIP avoids the installer UI, but database initialization,
   service configuration, patching, and backups remain required.
2. Put the PostgreSQL data directory on approved persistent storage, not under a user profile,
   OneDrive, or the application release directory. Set the PostgreSQL service to Automatic.
3. Configure `listen_addresses = 'localhost'`. Keep `pg_hba.conf` restricted to loopback with
   `scram-sha-256`; do not add a remote listen address, broad subnet, or `trust` rule. Do not
   add a Windows Firewall rule for port 5432.
4. Use separate migration-owner and runtime roles. Connect locally as the PostgreSQL
   administrator and create the roles/database:

   ```sql
   CREATE ROLE clm_uat_migrator LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
   CREATE ROLE clm_uat_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
   CREATE DATABASE clm_uat OWNER clm_uat_migrator ENCODING 'UTF8';
   ```

   Set each role password interactively with `\password clm_uat_migrator` and
   `\password clm_uat_app` in `psql`; do not put passwords in SQL files, command arguments, or
   chat. Connect to `clm_uat` as the database administrator and grant the migration owner
   schema creation rights, then runtime DML and sequence access:

   ```sql
   GRANT CONNECT ON DATABASE clm_uat TO clm_uat_app;
   GRANT USAGE, CREATE ON SCHEMA public TO clm_uat_migrator;
   GRANT USAGE ON SCHEMA public TO clm_uat_app;
   ```

   After running migrations as `clm_uat_migrator`, grant runtime rights and defaults:

   ```sql
   GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO clm_uat_app;
   GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO clm_uat_app;
   ALTER DEFAULT PRIVILEGES FOR ROLE clm_uat_migrator IN SCHEMA public
     GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO clm_uat_app;
   ALTER DEFAULT PRIVILEGES FOR ROLE clm_uat_migrator IN SCHEMA public
     GRANT USAGE, SELECT ON SEQUENCES TO clm_uat_app;
   REVOKE CREATE ON SCHEMA public FROM clm_uat_app;
   ```

   The running app must never use the migration-owner credentials.

## 3. Configure the app and run native migrations

Deploy a reviewed release to `C:\Apps\clm-uat`. Use a currently supported Node.js LTS version
compatible with Next.js 16, and install dependencies from the lockfile:

```powershell
Set-Location C:\Apps\clm-uat
npm ci
npm test
npm run lint
npx tsc --noEmit -p tsconfig.json
npm run build
```

Create a protected `C:\Apps\clm-uat\.env.production` with:

```dotenv
DATABASE_URL=postgresql://clm_uat_app:<URL-ENCODED-PASSWORD>@127.0.0.1:5432/clm_uat
ACCESS_CODE_PEPPER=<EXISTING-PRODUCTION-PEPPER>
EVIDENCE_STORAGE_DIR=C:/ProgramData/CLM-UAT/evidence
```

Use an approved secrets manager or restrict the file ACL to the app service identity and
authorized administrators. Quote dotenv values containing `#`. Preserve the existing
`ACCESS_CODE_PEPPER` to keep current tester access-code hashes valid. Do not set any
`NEXT_PUBLIC_` database variables.

For schema changes, create a short-lived protected `.env.migration` containing
`MIGRATION_DATABASE_URL` for `clm_uat_migrator`, then run:

```powershell
npm run db:migrate
Remove-Item .env.migration
```

The migration runner is idempotent and serializes concurrent runs. Inspect `db/migrations/`
before applying migrations. Keep migration credentials out of the WinSW service environment.
After migrations, grant the runtime role the table and sequence permissions above.

For a **new, empty deployment only**, seed vendors and initial test cases:

```powershell
npm run db:seed -- "C:/approved/path/Honeywell_CLM_UAT_Tester_Draft.xlsx"
```

For a new deployment, create the first local administrator. For a hosted-data migration, wait
until after import. Create a protected temporary `.env.bootstrap` containing
`ADMIN_BOOTSTRAP_PASSWORD` with a unique password of at least 14 characters, then run:

```powershell
npm run db:create-admin -- admin@example.com "Admin Name"
Remove-Item .env.bootstrap
```

The script stores only a salted scrypt hash. Existing Supabase Auth passwords do not migrate;
each admin must receive a new local password. Do not use a hardcoded/shared source password.

## 4. Migrate hosted data and evidence

Rehearse this against a **new, empty staging database** first. The importer refuses a target that
already has application data. It copies application tables and Storage objects but deliberately
does not copy Supabase Auth users, tester/admin sessions, login attempts, or historical admin
credential links. Historical import rows retain their data, but `imported_by` is left null.

1. Keep the hosted project live while rehearsing. Confirm the source has migrations 0001 through
   0005 and test the native app against a clean database first.
2. Before the final import, schedule a write freeze so database rows and Storage objects form one
   consistent snapshot. Keep the hosted project read-only during the cutover window.
3. Run the importer on the Windows app server so it can write into the private evidence folder
   and reach PostgreSQL on loopback. IT must first provide an approved outbound path from Node.js
   to the hosted PostgreSQL endpoint and Storage API. Create a protected `.env.migration` with:

   ```dotenv
   SOURCE_DATABASE_URL=<HOSTED-POSTGRES-CONNECTION-STRING>
   SOURCE_SUPABASE_URL=https://<PROJECT-REF>.supabase.co
   SOURCE_SUPABASE_SERVICE_KEY=<TEMPORARY-SERVICE-ROLE-KEY>
   MIGRATION_DATABASE_URL=postgresql://clm_uat_migrator:<URL-ENCODED-PASSWORD>@127.0.0.1:5432/clm_uat
   EVIDENCE_STORAGE_DIR=C:/ProgramData/CLM-UAT/evidence
   ```

   These values are secrets. Do not commit or paste the file. The one-time importer requires
   Node.js HTTPS access to Supabase Storage and PostgreSQL access to the hosted source. If the
   server still gets Node `ECONNRESET`, ask IT to provide an approved temporary migration route
   or IT-managed migration host/tunnel; do not expose port 5432 broadly or disable TLS
   verification. The importer does not change or delete source data.
4. Run `npm run db:import-hosted`. It copies testers, cases, vendors, assignments, results,
   defects, comparisons, evidence metadata, history, settings, and import summaries. It downloads
   each private evidence object, preserving its relative storage path. Files larger than 10 MB
   must be reviewed and reduced or otherwise migrated under an approved policy before using this
   importer.
5. Verify source/target row counts, access-code login with the unchanged pepper, result history,
   comparisons, and evidence downloads. Recreate admins locally, then run the complete functional
   test checklist in staging.
6. Test restoring a PostgreSQL backup plus the evidence directory together. If an import fails,
   discard that staging database and evidence directory, create a fresh target, and rerun; do not
   rerun into a partially imported target.
7. At final cutover, freeze writes, take final source backups, import into the production target,
   run smoke tests, and point the app service at the native database. Keep hosted Supabase
   read-only for an agreed rollback period. Do not delete it until owners approve the cutover and
   restore test.

After success, remove `.env.migration`, `.env.bootstrap`, and any temporary source key from the
migration workstation and server. Rotate the Supabase service key if it was exposed outside its
normal secret store.

## 5. Protect evidence and service credentials

Create the configured evidence folder outside `C:\Apps\clm-uat`, for example:

```powershell
New-Item -ItemType Directory -Force C:\ProgramData\CLM-UAT\evidence
icacls C:\ProgramData\CLM-UAT\evidence /inheritance:r
icacls C:\ProgramData\CLM-UAT\evidence /grant:r "<DOMAIN>\<SERVICE_ACCOUNT>:(OI)(CI)M" "SYSTEM:(OI)(CI)F" "BUILTIN\Administrators:(OI)(CI)F"
```

Replace the service account placeholder with the approved least-privilege identity and verify
the ACL. The service needs read/write access; tester accounts must not have direct filesystem
access. The app writes generated file keys, never user-controlled paths, and downloads are
authenticated and sent as attachments.

Configure WinSW or the approved Windows service manager with:

- Executable: `C:\Program Files\nodejs\node.exe`
- Working directory: `C:\Apps\clm-uat`
- Arguments: `C:\Apps\clm-uat\node_modules\next\dist\bin\next start --hostname 127.0.0.1 --port 3000`
- Environment: `NODE_ENV=production`; Next.js loads the protected `.env.production`
- Log on as: a dedicated non-administrator account that can read app configuration, connect to
  PostgreSQL loopback, and modify only the evidence/log directories
- Startup: Automatic; rotate service logs and verify after reboot

Do not run the service as `LocalSystem` or a domain administrator. Keep port 3000 bound to
loopback. Do not expose port 5432 or the evidence directory to client networks.

## 6. Put HTTPS in front and smoke-test

Use IIS with URL Rewrite and ARR, or an approved reverse proxy. Bind the approved HTTPS
certificate on port 443 and proxy to `http://127.0.0.1:3000`. The app uses base path `/clm-uat`.
Allow inbound 443 only from approved client networks; do not create inbound rules for 3000 or
5432. Preserve the original `Host` and `X-Forwarded-Host` headers so Next.js Server Action origin
checks succeed.

From a separate client workstation, verify `/clm-uat/login`, `/clm-uat/admin/login`, tester and
admin login, assignment ownership, draft/save/submit, comparisons, defects, imports/exports,
evidence upload/download, and the Admin evidence on/off setting. Confirm that direct unauthenticated
downloads fail and evidence files are not reachable as static URLs.

### Keep the existing app live during rollout

Do not overwrite `C:\Apps\clm-uat`, rebuild its `.next` directory, or change the existing
`CLM-UAT` service while preparing the replacement. Deploy a separate copy and use a separate
database and evidence directory:

- New app: `C:\Apps\clm-uat-v2`
- New PostgreSQL database/runtime role: `clm_uat_v2` / `clm_uat_v2_app`
- New evidence directory: `C:\ProgramData\CLM-UAT-v2\evidence`
- New Next.js port: `127.0.0.1:3001`
- New WinSW service ID: `CLM-UAT-V2`

For the current **sandbox test** instance that was just created, use these actual values instead
of the later production-import names in this runbook:

- PostgreSQL endpoint: `127.0.0.1:5433`
- Sandbox database/runtime role: `clm_v2_sandbox` / `clm_v2_app`
- Sandbox migrator role: `clm_v2_migrator`
- Sandbox evidence path: `C:\ProgramData\CLM-UAT-v2\evidence`
- V2 app directory and port: `C:\Apps\clm-uat-v2` / `127.0.0.1:3001`

Create `C:\Apps\clm-uat-v2\.env.production` with the sandbox runtime connection, the existing
`ACCESS_CODE_PEPPER`, and the sandbox evidence directory. URL-encode reserved characters in the
database password. Do not put the migrator or `postgres` password in this file. Check the file
ACL so only the V2 service identity and authorized administrators can read it. The sandbox will
contain only the rows you seeded/created; it is not the imported production data yet.

The app's base path remains `/clm-uat`, so give the test deployment a **different DNS hostname**
and IIS binding, for example `clm-uat-v2.company.example`, proxying to port 3001. Test at
`https://clm-uat-v2.company.example/clm-uat/login`. This avoids changing the app base path or
conflicting with the old site's URL. Get the new DNS name and certificate through the normal IT
process; don't use a hosts-file change as the production cutover.

Use a separate service configuration, for example:

```xml
<service>
   <id>CLM-UAT-V2</id>
   <name>CLM UAT V2</name>
   <description>CLM UAT replacement application</description>
   <executable>C:\Program Files\nodejs\node.exe</executable>
   <arguments>"C:\Apps\clm-uat-v2\node_modules\next\dist\bin\next" start --hostname 127.0.0.1 --port 3001</arguments>
   <workingdirectory>C:\Apps\clm-uat-v2</workingdirectory>
   <env name="NODE_ENV" value="production" />
   <startmode>Automatic</startmode>
   <log mode="roll" />
   <onfailure action="restart" delay="10 sec" />
</service>
```

Before installing the service, test the production server process in the foreground from an
elevated/deployment PowerShell window:

```powershell
Set-Location C:\Apps\clm-uat-v2
$env:NODE_ENV = 'production'
npm.cmd run start -- --hostname 127.0.0.1 --port 3001
```

Confirm `http://127.0.0.1:3001/clm-uat/admin/login` loads locally, then stop it with Ctrl+C.
Do not run it at the same time as the service on port 3001.

For WinSW, put a copy of the WinSW executable and a matching XML file together in a new
directory, for example `C:\Apps\clm-uat-v2-service\clm-uat-v2-service.exe` and
`clm-uat-v2-service.xml`. The XML file must have the same base name as the executable. Install
and start only the V2 service:

```powershell
Set-Location C:\Apps\clm-uat-v2-service
& .\clm-uat-v2-service.exe install
```

In `services.msc`, set **CLM-UAT-V2** to a dedicated non-administrator service account, then start
it. Grant that identity read access to `C:\Apps\clm-uat-v2\.env.production`, read/execute on
the app files, modify access to the V2 evidence directory and WinSW log directory, and no access
to the old app's secrets/evidence. Verify `Get-Service CLM-UAT-V2` reports `Running` and that
`http://127.0.0.1:3001/clm-uat/admin/login` works locally. Do not modify or restart `CLM-UAT`.

### Configure a separate IIS site for V2

This requires an approved DNS name and a TLS certificate for it. Use a distinct name such as
`clm-uat-v2.company.example`; never bind the V2 site to the existing production hostname during
testing.

1. Install IIS, URL Rewrite, and Application Request Routing (ARR) if they are not already
   installed. In IIS Manager, select the server node, open **Application Request Routing Cache**
   > **Server Proxy Settings**, check **Enable proxy**, and apply. Leave the existing site's
   binding and proxy rule unchanged.
2. Create an empty IIS web root, for example `C:\Apps\clm-uat-v2-iis`, and create a new IIS site
   with that physical path. Add a binding for the V2 hostname on HTTPS/443 using its approved
   certificate. If there is an HTTP binding, make it redirect to HTTPS under your organization's
   policy.
3. Add an inbound URL Rewrite rule scoped only to the V2 site. Match `(.*)` and rewrite to
   `http://127.0.0.1:3001/{R:1}`. Preserve the incoming path exactly: the Next app already has
   base path `/clm-uat`, so a browser request to `/clm-uat/login` must reach Node as
   `/clm-uat/login`, not `/login` and not `/clm-uat/clm-uat/login`.
4. In ARR proxy settings, preserve the original host header so Next.js Server Action origin
   checks see the public V2 hostname. Forward the usual `X-Forwarded-For` and
   `X-Forwarded-Proto` headers. Do not add `clm-uat-v2.company.example` to the **old** site's
   bindings or rewrite rules.
5. Allow inbound HTTPS/443 only from approved client networks. Keep ports 3000, 3001, 5432, and
   5433 private; do not create remote firewall rules for Node or PostgreSQL.

From a client workstation, test `https://clm-uat-v2.company.example/clm-uat/admin/login` and
`/clm-uat/login`. Verify sign-in, assignment pages, save/submit, export, and local evidence
upload/download. Also try an unauthenticated evidence download and confirm it is rejected. Keep
the old production URL open and functioning throughout.

Complete the V2 database migration and acceptance checklist at the new hostname while the old
app remains available. For final cutover, freeze tester writes, perform the final import into a
fresh V2 database, recreate admin credentials, verify login and evidence, then change the
existing production IIS binding's upstream from port 3000 to port 3001. Smoke-test the original
production URL. Only after it succeeds should you stop the old `CLM-UAT` service. Keep its app
folder and the old hosted database read-only for the agreed rollback period. Rollback is the
reverse IIS upstream change plus restarting the old service; do not delete either old copy until
the new backup/restore test and business sign-off are complete.

If the server cannot install or run the PostgreSQL ZIP binaries under an approved service
identity, stop before cutover. The current code is PostgreSQL-specific; SQLite is not a drop-in
replacement and would require another tested data-layer conversion. Do not put the new app on the
old hosted database or stop the existing service as a workaround.

## 7. Backups, rollback, and monitoring

Back up PostgreSQL and the evidence directory together using an approved schedule. For example,
use `pg_dump -Fc` with a protected `PGPASSFILE`; do not put database passwords in command-line
arguments or scheduled-task definitions. Keep backups on separate protected storage and test a
restore to a clean database and evidence directory before go-live.

Monitor Node/WinSW and IIS logs, PostgreSQL service health, disk space, failed logins, database
backup completion, and evidence directory growth. Keep the hosted Supabase project read-only as
the rollback source until the new service is accepted. A database restore without the matching
evidence files is not a complete restore.