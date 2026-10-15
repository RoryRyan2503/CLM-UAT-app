"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { testerLogoutAction } from "@/app/actions/auth";
import { adminLogoutAction } from "@/app/actions/auth";

export function LogoutButton({ kind }: { kind: "tester" | "admin" }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleLogout() {
    startTransition(async () => {
      await (kind === "tester" ? testerLogoutAction() : adminLogoutAction());
      router.push(kind === "tester" ? "/login" : "/admin/login");
      router.refresh();
    });
  }

  return (
    <Button variant="outline" size="sm" onClick={handleLogout} disabled={isPending}>
      {isPending ? "Signing out…" : "Sign out"}
    </Button>
  );
}
