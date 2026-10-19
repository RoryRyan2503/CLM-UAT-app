"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { setEvidenceModeAction } from "@/app/actions/admin/settings";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { EvidenceMode } from "@/lib/data/appSettings";

export function EvidenceSettings({ initialMode }: { initialMode: EvidenceMode }) {
  const [mode, setMode] = useState(initialMode);
  const [isPending, startTransition] = useTransition();

  function updateMode(nextMode: EvidenceMode) {
    startTransition(async () => {
      const response = await setEvidenceModeAction({ mode: nextMode });
      if (!response.ok) {
        toast.error(response.error);
        return;
      }
      setMode(response.data);
      toast.success("Evidence settings saved.");
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Tester evidence</CardTitle>
        <CardDescription>Choose one evidence method. Testers will only see the selected method; evidence remains optional.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {([
          ["disabled", "Disabled", "Hide evidence entry controls. Previously saved evidence remains visible."],
          ["sharepoint", "SharePoint link only", "Testers paste a SharePoint URL. No server file upload is offered."],
          ["upload", "Upload to server only", "Testers upload evidence files to the private server directory. No URL entry is offered."],
        ] as const).map(([value, label, description]) => (
          <label key={value} className="flex cursor-pointer items-start gap-3 rounded-md border border-border p-3">
            <input
              type="radio"
              name="evidence-mode"
              value={value}
              className="mt-1 size-4 accent-primary"
              checked={mode === value}
              disabled={isPending}
              onChange={() => updateMode(value)}
            />
            <span>
              <span className="block text-sm font-medium">{label}</span>
              <span className="mt-1 block text-sm text-foreground-muted">{description}</span>
            </span>
          </label>
        ))}
      </CardContent>
    </Card>
  );
}
