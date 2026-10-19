"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { testerLoginAction } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RequiredMark } from "@/components/ui/required-mark";

export function TesterLoginForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await testerLoginAction(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success("Signed in successfully.");
      router.push("/dashboard");
      router.refresh();
    });
  }

  return (
    <form action={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="identifier">Name or email<RequiredMark /></Label>
        <Input id="identifier" name="identifier" required autoComplete="username" placeholder="Jane Doe or jane@example.com" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="accessCode">Access code<RequiredMark /></Label>
        <Input
          id="accessCode"
          name="accessCode"
          required
          autoComplete="off"
          placeholder="XXXX-XXXX"
          className="uppercase tracking-wider"
        />
      </div>
      {error ? <p className="text-sm text-critical">{error}</p> : null}
      <Button type="submit" disabled={isPending} className="mt-2">
        {isPending ? "Signing in…" : "Continue"}
      </Button>
    </form>
  );
}
