import { redirect } from "next/navigation";
import Link from "next/link";
import { getAdminSession } from "@/lib/auth/adminSession";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AdminLoginForm } from "@/components/admin-login-form";

export default async function AdminLoginPage() {
  const admin = await getAdminSession();
  if (admin) redirect("/admin");

  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-surface px-4 py-16">
      <div className="mb-8 flex flex-col items-center gap-1 text-center">
        <span className="text-xs font-semibold uppercase tracking-widest text-primary">Honeywell</span>
        <h1 className="text-2xl font-semibold">CLM Vendor UAT — Admin</h1>
      </div>
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Admin sign-in</CardTitle>
          <CardDescription>Sign in with your administrator email and password.</CardDescription>
        </CardHeader>
        <CardContent>
          <AdminLoginForm />
        </CardContent>
      </Card>
      <Link href="/login" className="mt-6 text-sm text-foreground-muted hover:text-foreground hover:underline">
        Tester sign-in
      </Link>
    </div>
  );
}
