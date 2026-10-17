# Historical: Windows app with self-hosted Supabase in Linux VM

> This Supabase-in-Hyper-V design is no longer the target. The app now uses native Windows
> PostgreSQL and local evidence storage. Follow
> [windows-postgresql-migration.md](windows-postgresql-migration.md) for the current runbook.

This project is a Next.js Node.js application backed by Supabase PostgreSQL, Supabase Auth, and Supabase Storage. The target here is one Windows Server 2022 host, with the app running on Windows and Supabase running in a Linux VM under Hyper-V. Hosting only the Next.js process on Windows does not move the database or uploaded evidence on-premises.

## Target architecture

```text
Tester/admin browsers
            | HTTPS 443
            v
Windows Server 2022
   IIS reverse proxy + TLS
   Next.js app service (127.0.0.1:3000)
   Hyper-V Ubuntu Server VM
      Supabase Docker Compose stack
      HTTPS API endpoint on internal DNS
```

This is the least disruptive all-on-one-host design while using each platform where it is supported. Supabase documents a Docker Compose self-hosted stack for Linux; do not install Docker Desktop or the Supabase Compose stack directly on the production Windows Server. Use a Linux VM managed by IT. The Linux VM must have a stable IP, durable virtual disks, and its own backup plan.

Both the Windows app server and users' browsers must be able to reach the Linux VM's Supabase API over HTTPS. Admin login uses Supabase Auth in the browser, and evidence uploads go from the browser to Supabase Storage. Give the app and Supabase separate internal DNS names/certificates if that matches IT policy, such as `uat.company.example` and `supabase-uat.company.example`.

## Capacity gate

Supabase's published minimum for the self-host stack is 4 GB RAM, 2 CPU cores, and 40 GB SSD; its recommended baseline is 8 GB+ RAM, 4 CPU cores+, and 80 GB+ SSD. Those figures cover Supabase, not the Windows host, Next.js, evidence growth, backups, or monitoring. For the same physical machine, plan for at least 32 GB RAM, 8 logical CPU cores, and 200 GB+ usable SSD capacity as a reasonable starting point; actual requirements depend on concurrency and evidence retention. Keep backup capacity separate. A 16 GB host is a constrained pilot configuration, not a comfortable production target.

Before proceeding, verify actual host RAM, CPU, free SSD space, hardware virtualization support, and permission to install Hyper-V and restart the server. Microsoft documents Hyper-V installation on Windows Server through Server Manager or `Install-WindowsFeature`. If the host falls below the sizing target, or Hyper-V is not approved, request a separate Linux VM/host from IT rather than squeezing the full stack onto a low-memory machine.

Start with this read-only inventory in PowerShell on the Windows Server. It does not install or change anything:

```powershell
Get-ComputerInfo | Select-Object WindowsProductName, WindowsVersion, OsBuildNumber
Get-CimInstance Win32_ComputerSystem | Select-Object NumberOfLogicalProcessors, @{Name='RAM_GB';Expression={[math]::Round($_.TotalPhysicalMemory / 1GB, 1)}}
Get-CimInstance Win32_Processor | Select-Object Name, VirtualizationFirmwareEnabled, VMMonitorModeExtensions, SecondLevelAddressTranslationExtensions
Get-Volume | Select-Object DriveLetter, FileSystemLabel, @{Name='Size_GB';Expression={[math]::Round($_.Size / 1GB, 1)}}, @{Name='Free_GB';Expression={[math]::Round($_.SizeRemaining / 1GB, 1)}}
Get-WindowsFeature Hyper-V | Select-Object Name, InstallState
```

Do not paste internal hostnames, IP addresses, or account details into chat. The OS version, RAM, logical CPU count, free SSD space, virtualization capability values, and whether Hyper-V is installed are enough to assess the next step.

## Migration gate

Moving from hosted Supabase is a planned data migration, not a configuration-only change. It covers PostgreSQL schemas/data and database extensions; Supabase Auth users and provider/configuration settings; Storage bucket metadata and the actual evidence objects; internal URLs/API keys; and browser-to-service TLS/network access. A database dump alone will not move Storage file contents. Auth users/password hashes and service configuration must be validated against the specific self-hosted release; do not assume every hosted-platform setting is included in a dump.

Use a rehearsal target first. Back up the hosted project, restore into the Linux VM, copy and reconcile evidence objects, apply the app's migrations through 0005, and exercise admin login, tester login, assignments, save/submit, export, and evidence upload/download. Plan a write freeze for the final cutover, a rollback window, and a decision on whether to re-create Admin accounts or reset tester access codes. Preserve the existing `ACCESS_CODE_PEPPER` if retaining existing tester code hashes; otherwise issue new tester access codes. Do not decommission the hosted project until the on-prem restore and rollback have both been tested.

During the migration rehearsal only, the hosted project remains the production system. Switch the app's Supabase URL and keys to the internal endpoint only after the target has passed testing. `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are embedded during `next build`, so changing the URL requires a fresh app build and deployment.

## Sizing and prerequisites

For the Windows app alone, use 4 vCPU, 8 GB RAM, and at least 50 GB free SSD as a starting point. The single-host Windows + Linux VM configuration has a higher capacity gate above. Add storage for evidence based on expected file volume and retention; Supabase's 80 GB recommendation is not an evidence retention estimate.

Have your IT/server administrator provide:

- Windows Server 2022, patched and domain-managed as required, with Hyper-V approved and available.
- Hyper-V-capable hardware (CPU virtualization extensions enabled in firmware), enough RAM/CPU/disk for Windows plus the Linux VM, and an approved maintenance window for the required restart.
- An Ubuntu Server LTS Linux VM, Docker Engine and Docker Compose, assigned a static internal IP and durable storage; have IT approve its patching and backup ownership.
- Internal DNS and TLS certificates for the app hostname and Supabase API hostname.
- A DNS name such as `clm-uat.company.example` and an internal TLS certificate for it.
- A static IP or reserved DNS mapping.
- Inbound firewall access for HTTPS (443) only from approved tester/admin networks.
- Inbound HTTPS (443) to the app hostname and Supabase API hostname from approved tester/admin networks.
- A private VM network path from the Windows app process to the Supabase API; do not expose the Postgres port to user networks.
- A dedicated non-administrator service account and an approved location for app files and protected environment configuration.
- A backup/restore owner, retention period, and maintenance window.

Install an actively supported Node.js LTS release compatible with Next.js 16 (Node.js 20.9 or newer; Node.js 22 LTS is a conservative baseline). Install Git if you will deploy with `git`, or copy a reviewed release bundle from your build pipeline. Install IIS with URL Rewrite and Application Request Routing (ARR), or use an organization-approved reverse proxy.

## Build the Linux Supabase VM

This section is a staged architecture checklist, not a command sequence to run blindly on a production host. Have the Windows/virtualization and Linux administrators perform the changes under their normal change process.

1. Confirm capacity, Hyper-V entitlement, hardware virtualization, backup target, internal subnet, DNS names, and certificates with IT. Installing the Hyper-V role requires an administrator and server restart; adding an external virtual switch can affect network connectivity, so have the host/network administrator create and test it.
2. Install the Hyper-V role using Server Manager or Microsoft's documented PowerShell command `Install-WindowsFeature -Name Hyper-V -IncludeManagementTools -Restart`. Reconnect after the restart and verify the role. Do not run this command on a shared production host without approval and a maintenance window.
3. Create a Generation 2 Ubuntu Server LTS VM on an external or IT-approved virtual switch. As an initial allocation on a suitably sized host, reserve 4 vCPU, 8-12 GB startup RAM, and an 100 GB+ fixed/dynamically expanding virtual disk on durable SSD storage; increase these based on evidence storage and load. Ensure Windows retains enough memory and CPU to run IIS and Next.js. Configure a static VM IP and internal DNS.
4. Install Docker Engine and the Docker Compose plugin inside Ubuntu using Docker's official instructions. Follow the official Supabase self-hosting Docker guide's Linux quick start or manual installation for a pinned self-hosted release. Review the script/configuration before running it; do not use sample/default secrets.
5. Generate unique secrets, set a strong Studio dashboard password, configure the public/API/Site URLs, and pin the self-hosted release. Keep Supabase `.env` readable only by its Linux administrator and protected service accounts. Do not publish Studio or direct Postgres access to tester networks.
6. Put a TLS reverse proxy in front of the Supabase API gateway (for example, an IT-approved proxy on the Linux VM or a secured central proxy). The app requires HTTPS from tester browsers for Auth and Storage. Expose only the API hostname/HTTPS port to approved clients; keep database ports private. Restrict or disable Studio access except for administrators.
7. Configure Docker to start the stack on VM reboot. Verify all containers report healthy, make an encrypted database plus Storage-volume backup, and test restoring it before importing or migrating production data.

Use the official Supabase guide for the precise environment variable names for the pinned self-hosted release. This app's environment file expects the Supabase API URL, a client-safe anon/publishable API key, a server-only service-role/secret API key, and `ACCESS_CODE_PEPPER`; map the values from the generated self-hosted release, do not invent or reuse example keys.

## Prepare Supabase

1. Finish and validate the Linux VM, Supabase stack, private Studio access, internal HTTPS API endpoint, DNS, and backups before restoring production data.
2. For a clean on-premises database, apply migrations 0001 through 0005 in order using the Supabase SQL editor or the approved migration process, then apply `supabase/seed.sql`. For a migration from the hosted project, rehearse a complete database restore and Storage object copy first; do not apply migrations over a restored schema without comparing its migration state.
3. Confirm the `evidence` bucket exists and is private. Verify a test object can be uploaded, registered, signed, and downloaded through the HTTPS API from a separate workstation.
4. Create or confirm at least one Admin user against the on-prem Supabase Auth endpoint. Use `npm run db:create-admin` from a trusted deployment workstation configured for the on-prem project; do not expose the service-role key.
5. Import the approved workbook/test definitions and verify the case count. Keep the source workbook outside the web root and Git repository.

Do not point the production app at the on-prem endpoint until Auth and Storage have been validated from both the Windows app server and a tester workstation.

## Deploy the application on Windows

Run these in an elevated or deployment PowerShell session only for the server provisioning steps. Use your approved application directory, for example `C:\Apps\clm-uat`.

1. Fetch a reviewed release from the trusted Git remote or copy the release bundle into `C:\Apps\clm-uat`. Do not place it under a user profile or a OneDrive-synced folder.

   ```powershell
   New-Item -ItemType Directory -Force C:\Apps\clm-uat
   Set-Location C:\Apps\clm-uat
   git clone https://github.com/RoryRyan2503/CLM-UAT-app.git .
   ```

   Do not deploy from the remote `master` branch until the current local evidence-setting and deployment-documentation changes have been reviewed and pushed. For production, check out the specific reviewed commit/tag supplied by your release owner rather than deploying a moving branch.

2. Create `C:\Apps\clm-uat\.env.production` with the four values from `.env.example`:
   - `NEXT_PUBLIC_SUPABASE_URL` (the internal HTTPS API URL, reachable by browsers)
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` (the client-safe key from the self-hosted instance)
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `ACCESS_CODE_PEPPER`

   The Supabase URL and anon key are public configuration used in browser code. The service-role key and access-code pepper are secrets: do not prefix them with `NEXT_PUBLIC_`, commit them, paste them into chat, or expose them to testers. If migrating existing tester hashes, preserve the existing `ACCESS_CODE_PEPPER`; changing it invalidates existing access codes. Quote any dotenv value containing `#`.

   Restrict the `.env.production` ACL so only the service account and authorized administrators can read it. If your organization has a secrets manager, use its approved delivery mechanism instead of a plaintext file.

   `NEXT_PUBLIC_` variables are baked into the browser assets during `next build`, so put the correct production Supabase URL and anon key in place before building. A change to either requires another build and deployment.

3. Install dependencies, test, and build:

   ```powershell
   npm ci
   npm test
   npm run lint
   npx tsc --noEmit -p tsconfig.json
   npm run build
   ```

   Do not use `npm ci --omit=dev` before building; the build toolchain includes development dependencies. Keep the lockfile with the release.

4. Smoke-test the production server bound only to loopback:

   ```powershell
   $env:HOSTNAME = '127.0.0.1'
   $env:PORT = '3000'
   npm run start
   ```

   From the server, open `http://127.0.0.1:3000/login` and `/admin/login`. Complete an approved login test, verify a tester can load an assignment, and verify an evidence upload and signed download if evidence is enabled. Stop the foreground test process with Ctrl+C before installing the service.

   Confirm the Windows server and a tester workstation both trust the internal CA used for the Supabase HTTPS endpoint. If the corporate TLS-inspecting proxy causes Node-to-Supabase certificate errors, configure Node to trust the organization's approved root CA. This project already uses `NODE_USE_SYSTEM_CA=1` for its development script; for the production service set that environment variable only if required by your environment and Node version. Never disable certificate verification.

## Run Next.js as a Windows service

Use your organization's supported Windows service wrapper. If none exists, NSSM (Non-Sucking Service Manager) is a common option; obtain it from its official distribution, verify the download according to IT policy, and install the service from an elevated shell.

Configure the service with:

- Application: the installed Node.js `node.exe` path.
- Startup directory: `C:\Apps\clm-uat`.
- Arguments: `node_modules\next\dist\bin\next start --hostname 127.0.0.1 --port 3000`.
- Startup type: Automatic (Delayed Start), with restart-on-failure actions.
- Log output/error: a restricted, monitored log directory with rotation.
- Log on as: the dedicated least-privilege service account.
- Environment: `NODE_ENV=production`; add `NODE_USE_SYSTEM_CA=1` only if needed for corporate TLS inspection.

Keep port 3000 bound to loopback and blocked by Windows Firewall from remote networks. Do not run the process as Local System or a domain administrator. Confirm the service restarts after a controlled server reboot.

## Put HTTPS in front with IIS

1. Install IIS, the IIS URL Rewrite module, and ARR from Microsoft-approved sources.
2. In IIS Manager, open **Application Request Routing Cache → Server Proxy Settings**, enable proxying, and apply the change.
3. Create an IIS site for the app hostname and bind HTTPS (443) to the approved certificate. Do not expose a plain HTTP site to tester networks; redirect HTTP to HTTPS if your policy allows it.
4. Add an inbound reverse-proxy rewrite rule that forwards requests to `http://127.0.0.1:3000/{R:1}`. Preserve the original host and forwarding headers. Configure the maximum request size to cover expected workbook imports while retaining an explicit reasonable limit.
5. Bind the site only to the approved network interfaces, and add a Windows Firewall rule allowing inbound TCP 443 only from approved client subnets. Do not create an inbound rule for 3000.
6. Test `/login`, `/admin/login`, access-code tester login, admin login, Excel import/export, and evidence upload/download through the HTTPS hostname from a separate workstation.

Have your IIS/network administrator review TLS protocol/cipher policy, access logging, log retention, proxy request-size/time limits, and any corporate WAF requirements. Do not enable caching of authenticated pages or server actions.

## Operations and release updates

- Schedule regular database and evidence-storage backups, and perform a restore test before go-live. An app-folder backup is not a database backup.
- Monitor Windows service health, disk space, IIS/Node logs, Supabase availability, and failed login volume. Avoid logging passwords, access codes, service keys, or evidence contents.
- Keep Windows, Node.js, Next.js dependencies, IIS modules, and Supabase patched under your change-control process.
- For an update, deploy a reviewed commit to a new release folder, install dependencies, run tests and build, then switch the service to that release and restart. Keep the previous release available for rollback. Do not overwrite a live `.next` folder while the app is running.
- Back up `.env.production` securely and separately from source code; rotate secrets through the organization's change process.

## Go-live checklist

- [ ] Hyper-V/Linux VM capacity and full on-prem data migration approved.
- [ ] Migrations 0001-0005 applied and backup completed.
- [ ] Admin account created; tester access codes distributed through an approved channel.
- [ ] DNS and HTTPS certificate work from tester/admin networks.
- [ ] Service runs as a restricted account and binds only to `127.0.0.1:3000`.
- [ ] Only approved client networks can reach HTTPS; port 3000 is not remotely reachable.
- [ ] Tester and Admin flows pass through the production hostname.
- [ ] On-prem Supabase Auth and Storage are reachable over trusted HTTPS from browsers and the app server.
- [ ] Database and evidence backups are configured and a restore test has passed.
- [ ] Monitoring, patching, incident ownership, and rollback steps are assigned.
