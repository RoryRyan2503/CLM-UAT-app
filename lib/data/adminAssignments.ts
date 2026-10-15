import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/adminClient";
import { AppError } from "@/lib/actionResult";
import { embeddedOne } from "@/lib/supabase/embedded";
import { isCompletedStatus } from "@/lib/constants";
import { planAssignmentChanges } from "@/lib/assignmentPlan";

export interface AdminAssignmentOverview {
  testers: {
    id: string;
    name: string;
    email: string | null;
    persona: string | null;
    personaId: string | null;
    isActive: boolean;
    assignedCaseCount: number;
    completedAssignments: number;
    totalAssignments: number;
  }[];
  personas: { id: string; name: string }[];
  testCases: { id: string; testCaseId: string; functionalArea: string; scenario: string }[];
  personaCaseIds: Record<string, string[]>;
  testerCaseIds: Record<string, string[]>;
}

export async function getAdminAssignmentOverview(): Promise<AdminAssignmentOverview> {
  const supabase = createSupabaseAdminClient();
  const [testersResult, personasResult, casesResult, defaultsResult, assignmentsResult] = await Promise.all([
    supabase.from("testers").select("id, name, email, persona, persona_id, is_active").order("name"),
    supabase.from("personas").select("id, name").order("name"),
    supabase.from("test_cases").select("id, test_case_id, functional_area, scenario").order("test_case_id"),
    supabase.from("persona_test_cases").select("persona_id, test_case_id"),
    supabase.from("assignments").select("id, tester_id, test_case_id, is_active, test_results(status)"),
  ]);
  const failure = testersResult.error || personasResult.error || casesResult.error || defaultsResult.error || assignmentsResult.error;
  if (failure) throw new AppError("NOT_FOUND", "Unable to load assignment management data.");

  type AssignmentRow = {
    id: string;
    tester_id: string;
    test_case_id: string;
    is_active: boolean;
    test_results: { status: string } | { status: string }[] | null;
  };
  const assignmentRows = (assignmentsResult.data ?? []) as unknown as AssignmentRow[];
  const activeRows = assignmentRows.filter((row) => row.is_active);
  const testerCaseIds: Record<string, string[]> = {};
  const testerCompletion = new Map<string, { completed: number; total: number }>();
  const assignedCaseSets = new Map<string, Set<string>>();
  for (const row of activeRows) {
    const set = assignedCaseSets.get(row.tester_id) ?? new Set<string>();
    set.add(row.test_case_id);
    assignedCaseSets.set(row.tester_id, set);
    const tally = testerCompletion.get(row.tester_id) ?? { completed: 0, total: 0 };
    tally.total += 1;
    if (isCompletedStatus(embeddedOne(row.test_results)?.status)) tally.completed += 1;
    testerCompletion.set(row.tester_id, tally);
  }
  for (const [testerId, caseIds] of assignedCaseSets) testerCaseIds[testerId] = [...caseIds];

  const personaCaseIds: Record<string, string[]> = {};
  for (const mapping of defaultsResult.data ?? []) {
    const ids = personaCaseIds[mapping.persona_id] ?? [];
    ids.push(mapping.test_case_id);
    personaCaseIds[mapping.persona_id] = ids;
  }

  return {
    testers: (testersResult.data ?? []).map((tester) => {
      const tally = testerCompletion.get(tester.id) ?? { completed: 0, total: 0 };
      return {
        id: tester.id,
        name: tester.name,
        email: tester.email,
        persona: tester.persona,
        personaId: tester.persona_id,
        isActive: tester.is_active,
        assignedCaseCount: assignedCaseSets.get(tester.id)?.size ?? 0,
        completedAssignments: tally.completed,
        totalAssignments: tally.total,
      };
    }),
    personas: personasResult.data ?? [],
    testCases: (casesResult.data ?? []).map((testCase) => ({
      id: testCase.id,
      testCaseId: testCase.test_case_id,
      functionalArea: testCase.functional_area,
      scenario: testCase.scenario,
    })),
    personaCaseIds,
    testerCaseIds,
  };
}

async function ensureResultsForAssignments(assignmentIds: string[]) {
  if (assignmentIds.length === 0) return;
  const supabase = createSupabaseAdminClient();
  const { data: results, error: resultsError } = await supabase
    .from("test_results")
    .select("assignment_id")
    .in("assignment_id", assignmentIds);
  if (resultsError) throw new AppError("VALIDATION", "Unable to inspect evaluation records.");

  const existing = new Set((results ?? []).map((row) => row.assignment_id));
  const missing = assignmentIds.filter((id) => !existing.has(id));
  if (missing.length === 0) return;
  const { error } = await supabase.from("test_results").insert(missing.map((assignment_id) => ({ assignment_id })));
  if (error) throw new AppError("VALIDATION", "Unable to initialize new evaluations.");
}

export async function setTesterPersona(testerId: string, personaId: string) {
  const supabase = createSupabaseAdminClient();
  let personaName: string | null = null;
  if (personaId) {
    const { data, error } = await supabase.from("personas").select("name").eq("id", personaId).maybeSingle();
    if (error || !data) throw new AppError("NOT_FOUND", "Persona not found.");
    personaName = data.name;
  }
  const { error } = await supabase
    .from("testers")
    .update({ persona_id: personaId, persona: personaName })
    .eq("id", testerId);
  if (error) throw new AppError("VALIDATION", "Unable to update tester persona.");
}

export async function createPersona(name: string) {
  const normalized = name.trim().replace(/\s+/g, " ");
  if (!normalized) throw new AppError("VALIDATION", "Persona name is required.");
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("personas")
    .upsert({ name: normalized }, { onConflict: "name" })
    .select("id, name")
    .single();
  if (error || !data) throw new AppError("VALIDATION", "Unable to create persona.");
  return data;
}

export async function setPersonaTestCase(personaId: string, testCaseId: string, included: boolean) {
  const supabase = createSupabaseAdminClient();
  if (included) {
    const { error } = await supabase
      .from("persona_test_cases")
      .upsert({ persona_id: personaId, test_case_id: testCaseId }, { onConflict: "persona_id,test_case_id", ignoreDuplicates: true });
    if (error) throw new AppError("VALIDATION", "Unable to add test case to persona defaults.");
  } else {
    const { error } = await supabase
      .from("persona_test_cases")
      .delete()
      .eq("persona_id", personaId)
      .eq("test_case_id", testCaseId);
    if (error) throw new AppError("VALIDATION", "Unable to remove test case from persona defaults.");
  }
}

export async function setPersonaTestCases(personaId: string, testCaseIds: string[], included: boolean) {
  const ids = [...new Set(testCaseIds)];
  if (ids.length === 0) return { casesChanged: 0 };
  const supabase = createSupabaseAdminClient();
  const { data: validCases, error: casesError } = await supabase.from("test_cases").select("id").in("id", ids);
  if (casesError || (validCases ?? []).length !== ids.length) {
    throw new AppError("VALIDATION", "One or more selected test cases are invalid.");
  }
  if (included) {
    const { error } = await supabase
      .from("persona_test_cases")
      .upsert(ids.map((test_case_id) => ({ persona_id: personaId, test_case_id })), {
        onConflict: "persona_id,test_case_id",
        ignoreDuplicates: true,
      });
    if (error) throw new AppError("VALIDATION", "Unable to save persona defaults.");
  } else {
    const { error } = await supabase.from("persona_test_cases").delete().eq("persona_id", personaId).in("test_case_id", ids);
    if (error) throw new AppError("VALIDATION", "Unable to remove persona defaults.");
  }
  return { casesChanged: ids.length };
}

export async function setTesterCases(testerId: string, testCaseIds: string[], assigned: boolean) {
  const uniqueCaseIds = [...new Set(testCaseIds)];
  if (uniqueCaseIds.length === 0) return { assignmentsChanged: 0 };
  const supabase = createSupabaseAdminClient();
  const { data: tester, error: testerError } = await supabase
    .from("testers")
    .select("id, is_active")
    .eq("id", testerId)
    .maybeSingle();
  if (testerError || !tester || !tester.is_active) throw new AppError("NOT_FOUND", "Active tester not found.");

  const [{ data: vendors, error: vendorsError }, { data: cases, error: casesError }] = await Promise.all([
    supabase.from("vendors").select("id"),
    supabase.from("test_cases").select("id").in("id", uniqueCaseIds),
  ]);
  if (vendorsError || casesError || !vendors?.length) throw new AppError("VALIDATION", "Unable to load cases or vendors.");
  const validCaseIds = (cases ?? []).map((testCase) => testCase.id);
  if (validCaseIds.length !== uniqueCaseIds.length) throw new AppError("VALIDATION", "One or more test cases are invalid.");

  const { data: existing, error: existingError } = await supabase
    .from("assignments")
    .select("id, test_case_id, vendor_id, is_active")
    .eq("tester_id", testerId)
    .in("test_case_id", validCaseIds);
  if (existingError) throw new AppError("VALIDATION", "Unable to load current assignments.");

  const plan = planAssignmentChanges(existing ?? [], validCaseIds, (vendors ?? []).map((vendor) => vendor.id), assigned);

  if (!assigned) {
    if (plan.deactivateIds.length === 0) return { assignmentsChanged: 0 };
    const { error } = await supabase.from("assignments").update({ is_active: false }).in("id", plan.deactivateIds);
    if (error) throw new AppError("VALIDATION", "Unable to remove assignments from the tester workspace.");
    return { assignmentsChanged: plan.deactivateIds.length };
  }

  if (plan.reactivateIds.length > 0) {
    const { error } = await supabase.from("assignments").update({ is_active: true }).in("id", plan.reactivateIds);
    if (error) throw new AppError("VALIDATION", "Unable to reactivate existing assignments.");
  }
  let insertedIds: string[] = [];
  if (plan.insertPairs.length > 0) {
    const { data, error } = await supabase
      .from("assignments")
      .upsert(plan.insertPairs.map((pair) => ({ tester_id: testerId, ...pair, is_active: true })), { onConflict: "tester_id,test_case_id,vendor_id", ignoreDuplicates: true })
      .select("id");
    if (error) throw new AppError("VALIDATION", "Unable to add assignments.");
    insertedIds = (data ?? []).map((row) => row.id);
  }

  const allRelevantIds = [...(existing ?? []).map((row) => row.id), ...insertedIds];
  await ensureResultsForAssignments(allRelevantIds);
  return { assignmentsChanged: plan.reactivateIds.length + insertedIds.length };
}

export async function applyPersonaDefaults(testerId: string) {
  const supabase = createSupabaseAdminClient();
  const { data: tester, error } = await supabase.from("testers").select("persona_id").eq("id", testerId).maybeSingle();
  if (error || !tester) throw new AppError("NOT_FOUND", "Tester not found.");
  if (!tester.persona_id) throw new AppError("VALIDATION", "Select a persona for this tester first.");
  const { data: defaults, error: defaultsError } = await supabase
    .from("persona_test_cases")
    .select("test_case_id")
    .eq("persona_id", tester.persona_id);
  if (defaultsError) throw new AppError("NOT_FOUND", "Unable to load persona defaults.");
  const ids = (defaults ?? []).map((row) => row.test_case_id);
  if (ids.length === 0) throw new AppError("VALIDATION", "This persona has no default test cases yet.");
  return setTesterCases(testerId, ids, true);
}
