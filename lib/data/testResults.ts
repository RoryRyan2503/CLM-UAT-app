import "server-only";
import { withTransaction } from "@/lib/db/pool";
import type { PoolClient } from "pg";
import { AppError } from "@/lib/actionResult";
import {
  getConditionalRequirementErrors,
  type TestResultDraftInput,
} from "@/lib/validation/testResult";

async function loadOwnedAssignment(client: PoolClient, testerId: string, assignmentId: string) {
  const { rows } = await client.query(
    `select tr.*, a.tester_id, a.is_active
     from assignments a join test_results tr on tr.assignment_id = a.id
     where a.id = $1 for update of tr`,
    [assignmentId],
  );
  const row = rows[0] as (Record<string, unknown> & {
    tester_id: string; is_active: boolean; id: string; version: number; started_at: string | null;
  }) | undefined;
  if (!row) throw new AppError("NOT_FOUND", "Assignment not found.");
  if (row.tester_id !== testerId) throw new AppError("FORBIDDEN", "You may only edit your own assigned records.");
  if (!row.is_active) {
    throw new AppError("FORBIDDEN", "This test case is no longer assigned to your active workspace.");
  }
  return row;
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
  client: PoolClient,
  result: { id: string; version: number },
  patch: Record<string, unknown>,
  testerId: string,
  changeType: string,
) {
  const nextVersion = result.version + 1;
  const columns = Object.keys(patch);
  const values = Object.values(patch);
  const assignments = columns.map((column, index) => `${column} = $${index + 1}`);
  values.push(nextVersion, result.id, result.version);
  const { rows: updatedRows } = await client.query(
    `update test_results set ${assignments.join(", ")}, version = $${values.length - 2}, updated_at = now()
     where id = $${values.length - 1} and version = $${values.length} returning *`,
    values,
  );
  const updated = updatedRows[0];
  if (!updated) {
    throw new AppError(
      "CONFLICT",
      "This record was updated elsewhere since you loaded it. Reload to see the latest version.",
    );
  }

  await client.query(
    `insert into result_history
       (test_result_id, changed_by_tester_id, changed_by_admin, change_type, previous_values, new_values, version)
     values ($1, $2, false, $3, $4::jsonb, $5::jsonb, $6)`,
    [result.id, testerId, changeType, JSON.stringify(result), JSON.stringify(updated), nextVersion],
  );

  return updated;
}

/** Autosave: no conditional-completion validation, just persists whatever the user has typed. */
export async function saveTestResultDraft(testerId: string, input: TestResultDraftInput) {
  return withTransaction(async (client) => {
    const result = await loadOwnedAssignment(client, testerId, input.assignmentId);
    if (input.version !== result.version) {
      throw new AppError("CONFLICT", "This record was updated elsewhere. Reload to see the latest version.");
    }
    const patch = { ...toRowPatch(input, testerId), started_at: result.started_at ?? new Date() };
    return applyUpdate(client, result, patch, testerId, "draft_save");
  });
}

/** Full submission: enforces conditional completion rules server-side before persisting. */
export async function submitTestResult(testerId: string, input: TestResultDraftInput) {
  const fieldErrors = getConditionalRequirementErrors(input);
  if (Object.keys(fieldErrors).length > 0) {
    throw new AppError("VALIDATION", "Please resolve the highlighted fields.", fieldErrors);
  }

  return withTransaction(async (client) => {
    const result = await loadOwnedAssignment(client, testerId, input.assignmentId);
    if (input.version !== result.version) {
      throw new AppError("CONFLICT", "This record was updated elsewhere. Reload to see the latest version.");
    }
    const now = new Date();
    const patch = {
      ...toRowPatch(input, testerId),
      started_at: result.started_at ?? now,
      completed_at: now,
    };
    return applyUpdate(client, result, patch, testerId, "submit");
  });
}
