import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/adminClient";
import { AppError } from "@/lib/actionResult";
import { embeddedOne } from "@/lib/supabase/embedded";
import {
  getConditionalRequirementErrors,
  type TestResultDraftInput,
} from "@/lib/validation/testResult";

async function loadOwnedAssignment(testerId: string, assignmentId: string) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("assignments")
    .select("id, tester_id, is_active, test_results(*)")
    .eq("id", assignmentId)
    .maybeSingle();

  type Row = {
    id: string;
    tester_id: string;
    is_active: boolean;
    test_results:
      | { id: string; version: number; started_at: string | null }
      | { id: string; version: number; started_at: string | null }[]
      | null;
  };
  const assignment = data as unknown as Row | null;

  if (error || !assignment) throw new AppError("NOT_FOUND", "Assignment not found.");
  if (assignment.tester_id !== testerId) {
    throw new AppError("FORBIDDEN", "You may only edit your own assigned records.");
  }
  if (!assignment.is_active) {
    throw new AppError("FORBIDDEN", "This test case is no longer assigned to your active workspace.");
  }
  const result = embeddedOne(assignment.test_results);
  if (!result) throw new AppError("NOT_FOUND", "Result record not found for this assignment.");
  return { supabase, result };
}

function toRowPatch(input: TestResultDraftInput, testerId: string) {
  return {
    actual_result: input.actualResult ?? null,
    feature_adequate: input.featureAdequate ?? null,
    improvement_needed: input.improvementNeeded ?? null,
    improvement_description: input.improvementNeeded === true ? input.improvementDescription?.trim() || null : null,
    feature_user_friendly: input.featureUserFriendly ?? null,
    status: input.status,
    grade: input.grade ?? null,
    severity: input.severity ?? null,
    defect_id: input.defectId ?? null,
    workaround_notes: input.workaroundNotes ?? null,
    usability_rating: input.usabilityRating ?? null,
    configuration_required: input.configurationRequired ?? null,
    vendor_assistance_required: input.vendorAssistanceRequired ?? null,
    blocked_reason: input.blockedReason ?? null,
    blocked_owner: input.blockedOwner ?? null,
    blocked_target_date: input.blockedTargetDate ?? null,
    updated_by_tester_id: testerId,
  };
}

async function applyUpdate(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  result: { id: string; version: number },
  patch: Record<string, unknown>,
  testerId: string,
  changeType: string,
) {
  const nextVersion = result.version + 1;
  const { data: updated, error } = await supabase
    .from("test_results")
    .update({ ...patch, version: nextVersion })
    .eq("id", result.id)
    .eq("version", result.version)
    .select("*")
    .maybeSingle();

  if (error) throw new AppError("VALIDATION", "Unable to save result.");
  if (!updated) {
    throw new AppError(
      "CONFLICT",
      "This record was updated elsewhere since you loaded it. Reload to see the latest version.",
    );
  }

  await supabase.from("result_history").insert({
    test_result_id: result.id,
    changed_by_tester_id: testerId,
    changed_by_admin: false,
    change_type: changeType,
    previous_values: result,
    new_values: updated,
    version: nextVersion,
  });

  return updated;
}

/** Autosave: no conditional-completion validation, just persists whatever the user has typed. */
export async function saveTestResultDraft(testerId: string, input: TestResultDraftInput) {
  const { supabase, result } = await loadOwnedAssignment(testerId, input.assignmentId);
  if (input.version !== result.version) {
    throw new AppError("CONFLICT", "This record was updated elsewhere. Reload to see the latest version.");
  }

  const patch = {
    ...toRowPatch(input, testerId),
    started_at: result.started_at ?? new Date().toISOString(),
  };
  return applyUpdate(supabase, result, patch, testerId, "draft_save");
}

/** Full submission: enforces conditional completion rules server-side before persisting. */
export async function submitTestResult(testerId: string, input: TestResultDraftInput) {
  const fieldErrors = getConditionalRequirementErrors(input);
  if (Object.keys(fieldErrors).length > 0) {
    throw new AppError("VALIDATION", "Please resolve the highlighted fields.", fieldErrors);
  }

  const { supabase, result } = await loadOwnedAssignment(testerId, input.assignmentId);
  if (input.version !== result.version) {
    throw new AppError("CONFLICT", "This record was updated elsewhere. Reload to see the latest version.");
  }

  const patch = {
    ...toRowPatch(input, testerId),
    started_at: result.started_at ?? new Date().toISOString(),
    completed_at: new Date().toISOString(),
  };
  return applyUpdate(supabase, result, patch, testerId, "submit");
}
