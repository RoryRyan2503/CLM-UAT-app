# Historical: host the app on Windows Server, keep Supabase hosted

> Superseded architecture: the application runtime now uses native PostgreSQL, local admin
> authentication, and private filesystem evidence storage. Follow
> [windows-postgresql-migration.md](windows-postgresql-migration.md) for the current deployment.

This is the simplest transition for the current app. The Next.js application runs on Windows Server 2022, but PostgreSQL, Supabase Auth, and evidence Storage remain in the existing hosted Supabase project. This does **not** move UAT data or evidence on-premises. Confirm data residency/security approval before proceeding.

The app cannot be deployed as static HTML: Server Components, Server Actions, Admin Auth, tester sessions, imports/exports, and server-side authorization all require the Node.js Next.js server.

## Request flow

```text
Tester/admin browser --HTTPS--> Windows Server IIS --loopback--> Next.js on Node.js
        |                                              |
        +----------- HTTPS to hosted Supabase --------+
                                                       +--HTTPS--> hosted Supabase
```

Both the Windows server and each user's browser need HTTPS access to the hosted Supabase project:

- The Windows app server uses Supabase for database queries and server-side session/authorization work.
- Admin sign-in/session uses Supabase Auth; browser requests may reach Supabase directly.
- Evidence upload/download uses Supabase Storage directly from the browser with short-lived signed URLs.

Do not firewall Supabase access based only on the server IP. Confirm the tester/admin workstation networks can also reach the project URL.

## Before starting

Ask IT for:

- A Windows Server 2022 host, patched and approved for this service.
- A DNS name for the app, such as `clm-uat.company.example`, and an internal TLS certificate trusted by tester/admin workstations.
- A dedicated, non-administrator Windows service account.
- An approved application directory such as `C:\Apps\clm-uat` and a restricted configuration/secrets location.
- Inbound HTTPS (TCP 443) only from approved tester/admin networks.
- Outbound HTTPS (TCP 443) from the server to the hosted Supabase project URL.
- Confirmation that tester/admin browsers are allowed to access the same hosted Supabase URL over HTTPS.
- A maintenance window, service monitoring, and an owner for application releases and rollback.

Use this read-only PowerShell inventory before sizing the server:

```powershell
Get-ComputerInfo | Select-Object WindowsProductName, WindowsVersion, OsBuildNumber
Get-CimInstance Win32_ComputerSystem | Select-Object NumberOfLogicalProcessors, @{Name='RAM_GB';Expression={[math]::Round($_.TotalPhysicalMemory / 1GB, 1)}}
Get-Volume | Select-Object DriveLetter, FileSystemLabel, @{Name='Size_GB';Expression={[math]::Round($_.Size / 1GB, 1)}}, @{Name='Free_GB';Expression={[math]::Round($_.SizeRemaining / 1GB, 1)}}
```

As an initial planning baseline for this UAT app, allow 4 CPU cores, 8 GB RAM, and 50 GB free SSD. This is not a benchmark guarantee; check actual use during the pilot. This app-only deployment does not require Hyper-V or a Linux VM.

## 1. Prepare the hosted Supabase project

1. Confirm you have approval to keep the database, Admin Auth, and evidence files in the current Supabase project and region.
2. Back up the project before applying schema changes.
3. Apply any missing migrations in order. If the hosted project is currently at migration 0004, apply `supabase/migrations/0005_evidence_setting.sql` using the Supabase SQL Editor. If it is a new project, apply migrations 0001 through 0005, then `supabase/seed.sql`. Do not re-run earlier non-idempotent migrations on an existing project.
4. Check the Admin account exists and tester accounts/assignments are available. Do not create duplicate production testers or re-import definitions unless needed.
5. If using the new app release, verify the database has `app_settings` and that the evidence setting can be read from the Admin Settings page after deployment.
6. In Supabase Auth URL configuration, set the production app hostname as the Site URL and add the exact HTTPS app URL (and any approved preview/staging URL) to the allowed redirect URLs. Keep the URL list narrow; do not use broad wildcards in production.
7. Keep Supabase Storage's `evidence` bucket private. Verify the project URL is reachable by a tester workstation as well as by the Windows server.

## 2. Prepare a reviewed application release

The local workspace may contain changes that are not yet in GitHub. Do not assume cloning the existing `master` branch gets the evidence setting or this deployment guidance. First have the release owner publish a reviewed commit/tag containing the code you intend to deploy, or use your organization's approved artifact pipeline to create a release bundle from that exact revision. Do not deploy straight from a developer's working tree.

On the Windows Server:

1. Install a currently supported Node.js LTS release compatible with Next.js 16 (Node.js 20.9 or newer; Node.js 22 LTS is a conservative baseline). Use the official Node.js download source and your IT software approval process.
2. Install Git only if your approved deployment process uses Git. Otherwise, copy the reviewed release bundle.
3. Install IIS with the URL Rewrite module and Application Request Routing (ARR), or use an IT-approved reverse proxy with equivalent HTTPS and forwarding-header behavior.
4. Create the application directory, for example:

   ```powershell
   New-Item -ItemType Directory -Force C:\Apps\clm-uat
   ```

5. Fetch/copy the exact reviewed release into that directory. Ensure `package.json`, `package-lock.json`, `next.config.ts`, `app`, `components`, `lib`, `scripts`, `vendor`, and required public assets are present. Do not copy `.env.local`, `.env.production`, `node_modules`, `.next`, the source workbook, or database backups from a developer workstation.

## 3. Configure production environment securely

Create `C:\Apps\clm-uat\.env.production` using values from the existing hosted Supabase project:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://<REPLACE_ME>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<REPLACE_ME>
SUPABASE_SERVICE_ROLE_KEY=<REPLACE_ME>
ACCESS_CODE_PEPPER=<REPLACE_ME>
```

- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are public browser configuration. Use the correct production project values.
- `SUPABASE_SERVICE_ROLE_KEY` bypasses Row Level Security. It must remain server-only and be readable only by the Windows service account and authorized administrators.
- Preserve the production `ACCESS_CODE_PEPPER` if existing tester access codes must continue to work. Changing it invalidates their lookup hashes.
- Never commit `.env.production`, put secrets in a command argument, paste secrets into chat, or send a service-role key to testers.
- Quote any dotenv value containing `#`, for example `ACCESS_CODE_PEPPER="value#suffix"`.
- `NEXT_PUBLIC_` values are embedded at build time. Set the production URL/key before `npm run build`; changing them requires a rebuild and redeployment.

Restrict the environment file ACL to the deployment administrators and service identity. Example after replacing the service account with the approved identity:

```powershell
icacls C:\Apps\clm-uat\.env.production /inheritance:r
icacls C:\Apps\clm-uat\.env.production /grant:r "<DOMAIN>\<SERVICE_ACCOUNT>:(R)" "<DOMAIN>\<DEPLOYMENT_ADMIN>:(F)" "SYSTEM:(F)"
```

Have IT verify the resulting ACL. Do not copy the example placeholders literally.

## 4. Install, test, and build

Open PowerShell in the application directory as the deployment identity:

```powershell
Set-Location C:\Apps\clm-uat
npm ci
npm test
npm run lint
npx tsc --noEmit -p tsconfig.json
npm run build
```

If corporate TLS inspection blocks Node.js certificate validation when contacting Supabase, ask IT for the approved corporate CA setup and configure Node to trust it. Never disable TLS certificate validation. The development script enables Node's system CA support; configure the production service accordingly only if needed and approved.

## 5. Smoke-test Next.js locally on the server

Start a foreground production process for the initial smoke test:

```powershell
Set-Location C:\Apps\clm-uat
$env:NODE_ENV = 'production'
$env:HOSTNAME = '127.0.0.1'
$env:PORT = '3000'
npm run start
```

From the server, open `http://127.0.0.1:3000/login` and `/admin/login`. Check that the pages render. Test full authentication and data flows from a workstation after the HTTPS proxy is configured. Stop the foreground process with Ctrl+C before installing the Windows service.

If pages return a Supabase/network error, check that `.env.production` is in the app root, the service process uses that directory, values match the intended project, and the server can reach the project over trusted HTTPS. Do not reveal secrets in diagnostic output.

## 6. Run Next.js as a Windows service

Use the organization's approved service wrapper. If IT approves NSSM, obtain and verify it through the organization's normal software process, then configure a service with:

- Application: the installed Node.js `node.exe` path.
- Startup directory: `C:\Apps\clm-uat`.
- Arguments: `node_modules\next\dist\bin\next start --hostname 127.0.0.1 --port 3000`.
- Log on as: the dedicated least-privilege service account.
- Startup: Automatic (Delayed Start), with restart-on-failure actions.
- Logs: restricted directory, monitored and rotated.
- Environment: `NODE_ENV=production`; add `NODE_USE_SYSTEM_CA=1` only if required for the corporate CA environment and supported by the installed Node release.

Keep the application bound to `127.0.0.1:3000`. Do not create a remote firewall rule for port 3000. Do not run Next.js as Local System or a domain administrator. Verify the service starts after a controlled restart.

## 7. Publish the app through IIS over HTTPS

1. In IIS Manager, enable proxying under **Application Request Routing Cache → Server Proxy Settings**.
2. Create an IIS site bound to the approved app DNS hostname and TLS certificate on port 443.
3. Add an inbound URL Rewrite reverse-proxy rule for all application paths to `http://127.0.0.1:3000/{R:1}`. Preserve the query string, original host, and forwarded HTTPS/protocol information. Confirm the rule does not cache authenticated pages or Server Action requests.
4. Set an explicit request body size limit suitable for the approved workbook import size. Keep the limit finite and coordinate it with IIS Request Filtering and the application's file-size validation.
5. Allow inbound TCP 443 only from approved tester/admin networks. Do not expose TCP 3000.
6. Confirm DNS resolves to the intended server and the certificate is trusted from a separate tester/admin workstation.

Have the IIS/network administrator review TLS protocols/ciphers, security headers, access-log retention, proxy timeouts, and WAF requirements. Restrict the site to the intended internal network/VPN unless public access has been explicitly approved.

## 8. End-to-end test through the production URL

From a separate tester/admin workstation, use `https://<APP_HOSTNAME>` and verify:

- Tester login, assignments list, opening a case, autosave, and submit for both vendors.
- Admin login, tester/assignment screens, results, and Admin Settings.
- Evidence upload and signed file download if enabled.
- Import preview/commit and export, if those workflows are in scope.
- Sign-out, session expiry behavior, and that a tester cannot access another tester's records.
- Supabase Auth URL configuration matches the production HTTPS hostname.
- Browser developer tools show no HTTP mixed-content requests and no service-role key or access-code pepper in downloaded assets.

The first deployment runs against the same live hosted Supabase project and data as the current deployment. Coordinate a testing window so that two different app deployments do not unexpectedly share writes during acceptance testing.

## 9. Backups, updates, and rollback

- PostgreSQL and evidence data remain in hosted Supabase. Continue using its approved database backup and Storage retention/backup process; the Windows app-folder backup does not back up UAT data.
- Back up the reviewed app release and protected environment configuration using approved secure storage. Never include secrets in Git or general file shares.
- For each release, build in a new versioned folder, run tests and production build, smoke-test locally, stop the Windows service, switch the service directory/release pointer, and restart. Keep the previous release available for rollback. Never overwrite `.next` while a running process is serving it.
- Monitor Windows service health, IIS/Node logs, server disk/memory, failed login rate, and hosted Supabase connectivity.

## Phase 1 exit checklist

- [ ] Business/IT confirms hosted data residency is allowed for this interim phase.
- [ ] Hosted Supabase backup exists; migration 0005 is applied if deploying the new evidence setting.
- [ ] Reviewed code release and production environment values are in place with restricted ACLs.
- [ ] Node production build passes and the service is restricted to loopback.
- [ ] IIS serves the app on trusted HTTPS; only approved clients can reach it.
- [ ] Server and user browsers can both reach hosted Supabase over HTTPS.
- [ ] Tester, Admin, and required evidence workflows pass through the production hostname.
- [ ] Monitoring, release owner, backup owner, and rollback plan are documented.
