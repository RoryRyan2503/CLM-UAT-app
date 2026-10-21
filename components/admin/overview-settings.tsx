"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { setOverviewAttentionEnabledAction } from "@/app/actions/admin/settings";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function OverviewSettings({ initialAttentionEnabled }: { initialAttentionEnabled: boolean }) {
  const [enabled, setEnabled] = useState(initialAttentionEnabled);
  const [isPending, startTransition] = useTransition();

  function updateEnabled(nextValue: boolean) {
    startTransition(async () => {
      const response = await setOverviewAttentionEnabledAction({ enabled: nextValue });
      if (!response.ok) {
        toast.error(response.error);
        return;
      }
      setEnabled(response.data);
      toast.success(response.data ? "Attention tab enabled." : "Attention tab hidden.");
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Overview tabs</CardTitle>
        <CardDescription>Choose whether the attention queue is available on the Admin Overview page.</CardDescription>
      </CardHeader>
      <CardContent>
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            className="mt-1 size-4 accent-primary"
            checked={enabled}
            disabled={isPending}
            onChange={(event) => updateEnabled(event.currentTarget.checked)}
            aria-label="Show the Attention tab on Admin Overview"
          />
          <span>
            <span className="block text-sm font-medium">Show Attention tab</span>
            <span className="mt-1 block text-sm text-foreground-muted">
              {enabled ? "The Overview includes attention signals and follow-up cases." : "The Attention tab is hidden; its analytics remain available when re-enabled."}
            </span>
          </span>
        </label>
      </CardContent>
    </Card>
  );
}