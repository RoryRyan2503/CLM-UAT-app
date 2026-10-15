"use client";

import { useEffect } from "react";

/**
 * Warns before closing/reloading the tab when there are unsaved changes. Does not intercept
 * in-app client-side navigation (Next.js App Router has no built-in route-change veto hook);
 * forms should autosave frequently enough that in-app navigation rarely loses data.
 */
export function useUnsavedChangesWarning(hasUnsavedChanges: boolean) {
  useEffect(() => {
    function handler(event: BeforeUnloadEvent) {
      if (!hasUnsavedChanges) return;
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasUnsavedChanges]);
}
