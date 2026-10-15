import { Badge } from "@/components/ui/badge";
import type { SeverityValue } from "@/lib/constants";

const VARIANT_BY_SEVERITY: Record<SeverityValue, "default" | "warning" | "critical" | "outline"> = {
  Critical: "critical",
  High: "warning",
  Medium: "default",
  Low: "outline",
  Informational: "outline",
  "N/A": "outline",
};

export function SeverityBadge({ severity }: { severity: string }) {
  const variant = VARIANT_BY_SEVERITY[severity as SeverityValue] ?? "default";
  return <Badge variant={variant}>{severity}</Badge>;
}
