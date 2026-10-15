import { AlertTriangle } from "lucide-react";

export function CriticalBanner({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-critical bg-critical-bg px-4 py-3 text-sm font-medium text-critical">
      <AlertTriangle className="size-4 shrink-0" />
      <span>{children}</span>
    </div>
  );
}
