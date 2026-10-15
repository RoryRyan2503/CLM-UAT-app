import { Badge } from "@/components/ui/badge";
import type { StatusValue } from "@/lib/constants";

const VARIANT_BY_STATUS: Record<StatusValue, "default" | "primary" | "success" | "warning" | "critical" | "outline"> = {
  "Not Started": "outline",
  "In Progress": "primary",
  Pass: "success",
  "Pass with Observation": "success",
  Fail: "critical",
  Blocked: "warning",
  "Not Applicable": "outline",
  "Retest Required": "warning",
};

export function StatusBadge({ status }: { status: string }) {
  const variant = VARIANT_BY_STATUS[status as StatusValue] ?? "default";
  return <Badge variant={variant}>{status}</Badge>;
}
