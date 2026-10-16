"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { setEvidenceEnabledAction } from "@/app/actions/admin/settings";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function EvidenceSettings({ initialEnabled }: { initialEnabled: boolean }) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [isPending, startTransition] = useTransition();

  function updateEnabled(nextEnabled: boolean) {
    startTransition(async () => {
      const response = await setEvidenceEnabledAction({ enabled: nextEnabled });
      if (!response.ok) {
        toast.error(response.error);
        return;
      }
      setEnabled(response.data);
      toast.success(response.data ? "Evidence collection enabled." : "Evidence collection disabled.");
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Tester evidence</CardTitle>
        <CardDescription>Control whether testers can attach evidence to vendor evaluations. Evidence is optional when collection is enabled.</CardDescription>
      </CardHeader>
      <CardContent>
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            className="mt-1 size-4 accent-primary"
            checked={enabled}
            disabled={isPending}
            onChange={(event) => updateEnabled(event.currentTarget.checked)}
            aria-label="Enable evidence collection for testers"
          />
          <span>
            <span className="block text-sm font-medium">Allow evidence uploads and links</span>
            <span className="mt-1 block text-sm text-foreground-muted">
              {enabled
                ? "Evidence controls are shown in tester evaluations, but adding evidence is never required."
                : "Evidence controls are hidden and new evidence cannot be added. Previously saved evidence is retained."}
            </span>
          </span>
        </label>
      </CardContent>
    </Card>
  );
}
