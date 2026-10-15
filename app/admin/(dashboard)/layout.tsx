import { redirect } from "next/navigation";
import Link from "next/link";
import { getAdminSession } from "@/lib/auth/adminSession";
import { LogoutButton } from "@/components/logout-button";

const NAV_ITEMS = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/testers", label: "Testers" },
  { href: "/admin/import", label: "Import" },
  { href: "/admin/assignments", label: "Assignments" },
  { href: "/admin/results", label: "Results" },
  { href: "/admin/defects", label: "Defects" },
  { href: "/admin/export", label: "Export" },
  { href: "/admin/audit", label: "Audit" },
];

export default async function AdminDashboardLayout({ children }: { children: React.ReactNode }) {
  const admin = await getAdminSession();
  if (!admin) redirect("/admin/login");

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center justify-between">
            <div className="flex flex-col leading-tight">
              <span className="text-xs font-semibold uppercase tracking-widest text-primary">Honeywell</span>
              <span className="text-sm font-semibold">CLM Vendor UAT — Admin</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm text-foreground-muted">{admin.email}</span>
              <LogoutButton kind="admin" />
            </div>
          </div>
          <nav className="flex flex-wrap gap-1 text-sm">
            {NAV_ITEMS.map((item) => (
              <Link key={item.href} href={item.href} className="rounded-md px-3 py-1.5 font-medium hover:bg-surface-muted">
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
