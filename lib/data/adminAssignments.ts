import "server-only";
import { query, withTransaction } from "@/lib/db/pool";
import { AppError } from "@/lib/actionResult";
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
  testCases: { id: string; testCaseId: string; functionalArea: string; scenario: string; isActive: boolean }[];
  personaCaseIds: Record<string, string[]>;
  testerCaseIds: Record<string, string[]>;
}

export async function getAdminAssignmentOverview(): Promise<AdminAssignmentOverview> {
  const [testersResult, personasResult, casesResult, defaultsResult, assignmentsResult] = await Promise.all([
    query<{ id: string; name: string; email: string | null; persona: string | null; persona_id: string | null; is_active: boolean }>(
      "select id, name, email, persona, persona_id, is_active from testers order by name",
    ),
    query<{ id: string; name: string }>("select id, name from personas order by name"),
    query<{ id: string; test_case_id: string; functional_area: string; scenario: string; is_active: boolean }>(
      "select id, test_case_id, functional_area, scenario, is_active from test_cases order by test_case_id",
    ),
    query<{ persona_id: string; test_case_id: string }>("select persona_id, test_case_id from persona_test_cases"),
    query<{ id: string; tester_id: string; test_case_id: string; is_active: boolean; status: string | null }>(
      `select a.id, a.tester_id, a.test_case_id, a.is_active, tr.status
       from assignments a left join test_results tr on tr.assignment_id = a.id`,
    ),
  ]);
  const assignmentRows = assignmentsResult.rows;
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
    if (isCompletedStatus(row.status)) tally.completed += 1;
    testerCompletion.set(row.tester_id, tally);
  }
  for (const [testerId, caseIds] of assignedCaseSets) testerCaseIds[testerId] = [...caseIds];

  const personaCaseIds: Record<string, string[]> = {};
  for (const mapping of defaultsResult.rows) {
    const ids = personaCaseIds[mapping.persona_id] ?? [];
    ids.push(mapping.test_case_id);
    personaCaseIds[mapping.persona_id] = ids;
  }

  return {
    testers: testersResult.rows.map((tester) => {
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
    personas: personasResult.rows,
    testCases: casesResult.rows.map((testCase) => ({
      id: testCase.id,
      testCaseId: testCase.test_case_id,
      functionalArea: testCase.functional_area,
      scenario: testCase.scenario,
      isActive: testCase.is_active,
    })),
    personaCaseIds,
    testerCaseIds,
  };
}

async function ensureResultsForAssignments(
  client: Parameters<Parameters<typeof withTransaction>[0]>[0],
  assignmentIds: string[],
) {
  if (assignmentIds.length === 0) return;
  await client.query(
    `insert into test_results (assignment_id)
     select unnest($1::uuid[]) on conflict (assignment_id) do nothing`,
    [assignmentIds],
  );
}

export async function setTesterPersona(testerId: string, personaId: string) {
  let personaName: string | null = null;
  if (personaId) {
    const { rows } = await query<{ name: string }>("select name from personas where id = $1", [personaId]);
    if (!rows[0]) throw new AppError("NOT_FOUND", "Persona not found.");
    personaName = rows[0].name;
  }
  const { rowCount } = await query("update testers set persona_id = $1, persona = $2 where id = $3", [personaId || null, personaName, testerId]);
  if (!rowCount) throw new AppError("VALIDATION", "Unable to update tester persona.");
}

export async function createPersona(name: string) {
  const normalized = name.trim().replace(/\s+/g, " ");
  if (!normalized) throw new AppError("VALIDATION", "Persona name is required.");
  const { rows } = await query<{ id: string; name: string }>(
    "insert into personas (name) values ($1) on conflict (name) do update set name = excluded.name returning id, name",
    [normalized],
  );
  if (!rows[0]) throw new AppError("VALIDATION", "Unable to create persona.");
  return rows[0];
}

export async function setPersonaTestCase(personaId: string, testCaseId: string, included: boolean) {
  if (included) {
    const { rows } = await query<{ id: string }>("select id from test_cases where id = $1 and is_active", [testCaseId]);
    if (!rows[0]) throw new AppError("VALIDATION", "Archived test cases cannot be added to persona defaults.");
    await query(
      "insert into persona_test_cases (persona_id, test_case_id) values ($1, $2) on conflict do nothing",
      [personaId, testCaseId],
    );
  } else {
    await query("delete from persona_test_cases where persona_id = $1 and test_case_id = $2", [personaId, testCaseId]);
  }
}

export async function setPersonaTestCases(personaId: string, testCaseIds: string[], included: boolean) {
  const ids = [...new Set(testCaseIds)];
  if (ids.length === 0) return { casesChanged: 0 };
  const { rows: validCases } = await query<{ id: string }>(
    `select id from test_cases where id = any($1::uuid[]) ${included ? "and is_active" : ""}`,
    [ids],
  );
  if (validCases.length !== ids.length) {
    throw new AppError("VALIDATION", "One or more selected test cases are invalid.");
  }
  if (included) {
    await query(
      `insert into persona_test_cases (persona_id, test_case_id)
       select $1, unnest($2::uuid[]) on conflict do nothing`,
      [personaId, ids],
    );
  } else {
    await query("delete from persona_test_cases where persona_id = $1 and test_case_id = any($2::uuid[])", [personaId, ids]);
  }
  return { casesChanged: ids.length };
}

export async function setTesterCases(testerId: string, testCaseIds: string[], assigned: boolean) {
  const uniqueCaseIds = [...new Set(testCaseIds)];
  if (uniqueCaseIds.length === 0) return { assignmentsChanged: 0 };
  return withTransaction(async (client) => {
    const { rows: testers } = await client.query<{ id: string; is_active: boolean }>(
      "select id, is_active from testers where id = $1 for update",
      [testerId],
    );
    if (!testers[0]?.is_active) throw new AppError("NOT_FOUND", "Active tester not found.");
    const [{ rows: vendors }, { rows: cases }] = await Promise.all([
      client.query<{ id: string }>("select id from vendors"),
      client.query<{ id: string; is_active: boolean }>("select id, is_active from test_cases where id = any($1::uuid[])", [uniqueCaseIds]),
    ]);
    if (!vendors.length) throw new AppError("VALIDATION", "Unable to load cases or vendors.");
    const validCaseIds = cases.map((testCase) => testCase.id);
    if (validCaseIds.length !== uniqueCaseIds.length) throw new AppError("VALIDATION", "One or more test cases are invalid.");
    if (assigned && cases.some((testCase) => !testCase.is_active)) {
      throw new AppError("VALIDATION", "Archived test cases cannot be newly assigned.");
    }
    const { rows: existing } = await client.query<{ id: string; test_case_id: string; vendor_id: string; is_active: boolean }>(
      "select id, test_case_id, vendor_id, is_active from assignments where tester_id = $1 and test_case_id = any($2::uuid[]) for update",
      [testerId, validCaseIds],
    );
    const plan = planAssignmentChanges(existing, validCaseIds, vendors.map((vendor) => vendor.id), assigned);
    if (!assigned) {
      if (plan.deactivateIds.length === 0) return { assignmentsChanged: 0 };
      await client.query("update assignments set is_active = false where id = any($1::uuid[])", [plan.deactivateIds]);
      return { assignmentsChanged: plan.deactivateIds.length };
    }
    if (plan.reactivateIds.length > 0) {
      await client.query("update assignments set is_active = true where id = any($1::uuid[])", [plan.reactivateIds]);
    }
    const insertedIds: string[] = [];
    if (plan.insertPairs.length > 0) {
      const caseIds = plan.insertPairs.map((pair) => pair.test_case_id);
      const vendorIds = plan.insertPairs.map((pair) => pair.vendor_id);
      const { rows } = await client.query<{ id: string }>(
        `insert into assignments (tester_id, test_case_id, vendor_id, is_active)
         select $1, pairs.test_case_id, pairs.vendor_id, true
         from unnest($2::uuid[], $3::uuid[]) as pairs(test_case_id, vendor_id)
         on conflict (tester_id, test_case_id, vendor_id) do nothing returning id`,
        [testerId, caseIds, vendorIds],
      );
      insertedIds.push(...rows.map((row) => row.id));
    }
    await ensureResultsForAssignments(client, [...existing.map((row) => row.id), ...insertedIds]);
    return { assignmentsChanged: plan.reactivateIds.length + insertedIds.length };
  });
}

export async function applyPersonaDefaults(testerId: string) {
  const { rows: testers } = await query<{ persona_id: string | null }>("select persona_id from testers where id = $1", [testerId]);
  const tester = testers[0];
  if (!tester) throw new AppError("NOT_FOUND", "Tester not found.");
  if (!tester.persona_id) throw new AppError("VALIDATION", "Select a persona for this tester first.");
  const { rows: defaults } = await query<{ test_case_id: string }>(
    "select test_case_id from persona_test_cases where persona_id = $1",
    [tester.persona_id],
  );
  const ids = defaults.map((row) => row.test_case_id);
  if (ids.length === 0) throw new AppError("VALIDATION", "This persona has no default test cases yet.");
  return setTesterCases(testerId, ids, true);
}

export async function applyPersonaDefaultsToTesters(testerIds: string[]) {
  const uniqueTesterIds = [...new Set(testerIds)];
  if (uniqueTesterIds.length === 0) return { testersApplied: 0, testersSkipped: 0, casesAdded: 0 };

  return withTransaction(async (client) => {
    const { rows: testers } = await client.query<{ id: string; persona_id: string | null }>(
      "select id, persona_id from testers where id = any($1::uuid[]) and is_active for update",
      [uniqueTesterIds],
    );
    if (testers.length !== uniqueTesterIds.length) {
      throw new AppError("VALIDATION", "One or more selected testers are no longer active.");
    }

    const personaIds = [...new Set(testers.map((tester) => tester.persona_id).filter((id): id is string => Boolean(id)))];
    const [{ rows: vendors }, { rows: defaults }] = await Promise.all([
      client.query<{ id: string }>("select id from vendors"),
      personaIds.length
        ? client.query<{ persona_id: string; test_case_id: string }>(
          `select ptc.persona_id, ptc.test_case_id
           from persona_test_cases ptc join test_cases tc on tc.id = ptc.test_case_id
           where ptc.persona_id = any($1::uuid[]) and tc.is_active`,
          [personaIds],
        )
        : Promise.resolve({ rows: [] as { persona_id: string; test_case_id: string }[] }),
    ]);
    if (vendors.length === 0) throw new AppError("VALIDATION", "Unable to load vendors for assignments.");

    const casesByPersona = new Map<string, string[]>();
    for (const row of defaults) {
      const ids = casesByPersona.get(row.persona_id) ?? [];
      ids.push(row.test_case_id);
      casesByPersona.set(row.persona_id, ids);
    }
    const casesByTester = testers.map((tester) => ({
      testerId: tester.id,
      caseIds: tester.persona_id ? casesByPersona.get(tester.persona_id) ?? [] : [],
    }));
    const applied = casesByTester.filter((entry) => entry.caseIds.length > 0);
    if (applied.length === 0) {
      return { testersApplied: 0, testersSkipped: uniqueTesterIds.length, casesAdded: 0 };
    }

    const allCaseIds = [...new Set(applied.flatMap((entry) => entry.caseIds))];
    const { rows: existing } = await client.query<{
      id: string; tester_id: string; test_case_id: string; vendor_id: string; is_active: boolean;
    }>(
      `select id, tester_id, test_case_id, vendor_id, is_active from assignments
       where tester_id = any($1::uuid[]) and test_case_id = any($2::uuid[]) for update`,
      [applied.map((entry) => entry.testerId), allCaseIds],
    );

    const activateIds: string[] = [];
    const insertPairs: { tester_id: string; test_case_id: string; vendor_id: string }[] = [];
    const changedCasePairs = new Set<string>();
    for (const entry of applied) {
      const testerAssignments = existing.filter((row) => row.tester_id === entry.testerId);
      const plan = planAssignmentChanges(testerAssignments, entry.caseIds, vendors.map((vendor) => vendor.id), true);
      activateIds.push(...plan.reactivateIds);
      insertPairs.push(...plan.insertPairs.map((pair) => ({ tester_id: entry.testerId, ...pair })));
      for (const row of testerAssignments) {
        if (plan.reactivateIds.includes(row.id)) changedCasePairs.add(`${entry.testerId}:${row.test_case_id}`);
      }
      for (const pair of plan.insertPairs) changedCasePairs.add(`${entry.testerId}:${pair.test_case_id}`);
    }

    if (activateIds.length) {
      await client.query("update assignments set is_active = true where id = any($1::uuid[])", [activateIds]);
    }
    const insertedIds: string[] = [];
    if (insertPairs.length) {
      const { rows } = await client.query<{ id: string }>(
        `insert into assignments (tester_id, test_case_id, vendor_id, is_active)
         select pairs.tester_id, pairs.test_case_id, pairs.vendor_id, true
         from unnest($1::uuid[], $2::uuid[], $3::uuid[]) as pairs(tester_id, test_case_id, vendor_id)
         on conflict (tester_id, test_case_id, vendor_id) do nothing returning id`,
        [insertPairs.map((pair) => pair.tester_id), insertPairs.map((pair) => pair.test_case_id), insertPairs.map((pair) => pair.vendor_id)],
      );
      insertedIds.push(...rows.map((row) => row.id));
    }

    await ensureResultsForAssignments(client, [...existing.map((row) => row.id), ...insertedIds]);
    return {
      testersApplied: applied.length,
      testersSkipped: uniqueTesterIds.length - applied.length,
      casesAdded: changedCasePairs.size,
    };
  });
}
