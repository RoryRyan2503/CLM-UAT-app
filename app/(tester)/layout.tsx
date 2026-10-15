import { redirect } from "next/navigation";
import Link from "next/link";
import { getTesterSession } from "@/lib/auth/testerSession";
import { LogoutButton } from "@/components/logout-button";

export default async function TesterLayout({ children }: { children: React.ReactNode }) {
  const tester = await getTesterSession();
  if (!tester) redirect("/login");

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex w-full max-w-[1800px] items-center justify-between px-4 py-3 sm:px-6 xl:px-10">
          <div className="flex items-center gap-6">
            <div className="flex flex-col leading-tight">
              <span className="text-xs font-semibold uppercase tracking-widest text-primary">Honeywell</span>
              <span className="text-sm font-semibold">CLM Vendor UAT</span>
            </div>
            <nav className="flex items-center gap-1 text-sm">
              <Link href="/dashboard" className="rounded-md px-3 py-2 font-medium hover:bg-surface-muted">
                Dashboard
              </Link>
              <Link href="/assignments-v2" className="rounded-md px-3 py-2 font-medium hover:bg-surface-muted">
                Assignments
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-foreground-muted">{tester.name}</span>
            <LogoutButton kind="tester" />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1800px] flex-1 px-4 py-8 sm:px-6 xl:px-10">{children}</main>
    </div>
  );
}
