import { redirect } from "next/navigation";
import Link from "next/link";
import { getTesterSession } from "@/lib/auth/testerSession";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TesterLoginForm } from "@/components/tester-login-form";

export default async function LoginPage() {
  const tester = await getTesterSession();
  if (tester) redirect("/dashboard");

  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-surface px-4 py-16">
      <div className="mb-8 flex flex-col items-center gap-1 text-center">
        <span className="text-xs font-semibold uppercase tracking-widest text-primary">Honeywell</span>
        <h1 className="text-2xl font-semibold">CLM Vendor UAT</h1>
        <p className="text-sm text-foreground-muted">Ironclad vs. Sirion user acceptance testing</p>
      </div>
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Tester sign-in</CardTitle>
          <CardDescription>Enter your name or email and the access code your admin provided.</CardDescription>
        </CardHeader>
        <CardContent>
          <TesterLoginForm />
        </CardContent>
      </Card>
      <Link href="/admin/login" className="mt-6 text-sm text-foreground-muted hover:text-foreground hover:underline">
        Admin sign-in
      </Link>
    </div>
  );
}
