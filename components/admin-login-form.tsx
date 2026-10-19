"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { adminLoginAction } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RequiredMark } from "@/components/ui/required-mark";

export function AdminLoginForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await adminLoginAction(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push("/admin");
      router.refresh();
    });
  }

  return (
    <form action={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">Email<RequiredMark /></Label>
        <Input id="email" name="email" type="email" required autoComplete="email" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">Password<RequiredMark /></Label>
        <Input id="password" name="password" type="password" required autoComplete="current-password" />
      </div>
      {error ? <p className="text-sm text-critical">{error}</p> : null}
      <Button type="submit" disabled={isPending} className="mt-2">
        {isPending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
