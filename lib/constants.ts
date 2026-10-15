export const VENDOR_SLUGS = ["ironclad", "sirion"] as const;
export type VendorSlug = (typeof VENDOR_SLUGS)[number];

export const STATUS_VALUES = [
  "Not Started",
  "In Progress",
  "Pass",
  "Pass with Observation",
  "Fail",
  "Blocked",
  "Not Applicable",
  "Retest Required",
] as const;
export type StatusValue = (typeof STATUS_VALUES)[number];

export const GRADE_VALUES = ["A", "B", "C", "D", "F", "N/A"] as const;
export type GradeValue = (typeof GRADE_VALUES)[number];

export const SEVERITY_VALUES = [
  "Critical",
  "High",
  "Medium",
  "Low",
  "Informational",
  "N/A",
] as const;
export type SeverityValue = (typeof SEVERITY_VALUES)[number];

export const PREFERRED_VENDOR_VALUES = [
  "Ironclad",
  "Sirion",
  "Equal",
  "Unable to Decide",
] as const;
export type PreferredVendorValue = (typeof PREFERRED_VENDOR_VALUES)[number];

export const DEFECT_STATUS_VALUES = [
  "Open",
  "In Progress",
  "Retest Required",
  "Resolved",
  "Closed",
] as const;
export type DefectStatusValue = (typeof DEFECT_STATUS_VALUES)[number];

export const TESTER_SESSION_COOKIE = "clm_tester_session";
export const TESTER_SESSION_TTL_DAYS = 30;

export const EVIDENCE_BUCKET = "evidence";

export const PASSING_STATUSES: StatusValue[] = ["Pass", "Pass with Observation"];
export const COMPLETED_STATUSES: StatusValue[] = [
  "Pass",
  "Pass with Observation",
  "Fail",
  "Blocked",
  "Not Applicable",
];

export function isCompletedStatus(status: string | null | undefined): boolean {
  return !!status && COMPLETED_STATUSES.includes(status as StatusValue);
}

export function isCriticalResult(params: {
  severity?: string | null;
  status?: string | null;
}): boolean {
  return params.severity === "Critical" && params.status === "Fail";
}
