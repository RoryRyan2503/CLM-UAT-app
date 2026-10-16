import { z } from "zod";
import { STATUS_VALUES, GRADE_VALUES, SEVERITY_VALUES } from "@/lib/constants";

export const evidenceInputSchema = z
  .discriminatedUnion("kind", [
    z.object({ kind: z.literal("file"), evidenceId: z.string().uuid() }),
    z.object({ kind: z.literal("url"), url: z.string().url().max(2048) }),
  ])
  .nullable();

/** Fields that can always be autosaved as a draft, with no conditional requirements enforced. */
export const testResultDraftSchema = z.object({
  assignmentId: z.string().uuid(),
  version: z.number().int().nonnegative(),
  actualResult: z.string().max(10000).optional().nullable(),
  featureAdequate: z.boolean().optional().nullable(),
  improvementNeeded: z.boolean().optional().nullable(),
  improvementDescription: z.string().max(4000).optional().nullable(),
  featureUserFriendly: z.boolean().optional().nullable(),
  status: z.enum(STATUS_VALUES),
  grade: z.enum(GRADE_VALUES).optional().nullable(),
  severity: z.enum(SEVERITY_VALUES).optional().nullable(),
  evidence: evidenceInputSchema.optional(),
  defectId: z.string().uuid().optional().nullable(),
  workaroundNotes: z.string().max(10000).optional().nullable(),
  usabilityRating: z.number().int().min(1).max(5).optional().nullable(),
  configurationRequired: z.boolean().optional().nullable(),
  vendorAssistanceRequired: z.boolean().optional().nullable(),
  blockedReason: z.string().max(2000).optional().nullable(),
  blockedOwner: z.string().max(200).optional().nullable(),
  blockedTargetDate: z.string().optional().nullable(),
  startedAt: z.string().optional().nullable(),
  completedAt: z.string().optional().nullable(),
});

export type TestResultDraftInput = z.infer<typeof testResultDraftSchema>;

export interface FieldErrors {
  [field: string]: string;
}

/**
 * Conditional completion rules, enforced identically on the client (inline errors) and the
 * server (defense-in-depth) by importing this same function. Only runs when a result is being
 * submitted as complete, not for autosaved drafts.
 */
export function getConditionalRequirementErrors(input: TestResultDraftInput): FieldErrors {
  const errors: FieldErrors = {};

  if (input.improvementNeeded === true && !input.improvementDescription?.trim()) {
    errors.improvementDescription = "Describe the required improvements when improvement is needed.";
  }

  if (input.status === "Fail") {
    if (!input.actualResult?.trim()) errors.actualResult = "Actual result is required for Fail.";
    if (!input.severity || input.severity === "N/A") {
      errors.severity = "A specific severity is required for Fail.";
    }
    if (!input.defectId) errors.defectId = "A linked defect is required for Fail.";
  }

  if (input.status === "Blocked") {
    if (!input.blockedReason?.trim()) errors.blockedReason = "A reason is required for Blocked.";
    if (!input.blockedOwner?.trim()) errors.blockedOwner = "An owner is required for Blocked.";
    if (!input.blockedTargetDate) {
      errors.blockedTargetDate = "A target date is required for Blocked.";
    }
  }

  if (input.status === "Pass") {
    if (!input.actualResult?.trim()) errors.actualResult = "Actual result is required for Pass.";
    if (input.grade !== "A" && input.grade !== "B") {
      errors.grade = "Grade must be A or B for Pass.";
    }
  }

  return errors;
}

export function hasConditionalErrors(input: TestResultDraftInput): boolean {
  return Object.keys(getConditionalRequirementErrors(input)).length > 0;
}
