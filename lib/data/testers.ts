import "server-only";
import { query, withTransaction } from "@/lib/db/pool";
import { AppError } from "@/lib/actionResult";
import { generateAccessCode, hashAccessCodeForLookup, hashAccessCodeForStorage } from "@/lib/auth/accessCodes";
import type { CreateTesterInput } from "@/lib/validation/tester";
import type { Database } from "@/lib/types/database";
import type { TesterRosterError, TesterRosterRow } from "@/lib/import/parseTesterRoster";
import { testerDeleteBatchSchema } from "@/lib/validation/testerDeletion";

type TesterRow = Database["public"]["Tables"]["testers"]["Row"];

export async function listTesters() {
  const { rows } = await query<TesterRow>("select * from testers order by created_at desc");
  return rows;
}

export async function listPersonas() {
  const { rows } = await query<{ id: string; name: string }>("select id, name from personas order by name");
  return rows;
}

/** Returns the plaintext code once; only the hash is persisted. */
export async function createTester(input: CreateTesterInput): Promise<{ tester: unknown; accessCode: string }> {
  const accessCode = generateAccessCode();
  try {
    return await withTransaction(async (client) => {
      const { rows: personas } = await client.query<{ id: string; name: string }>(
        "select id, name from personas where id = $1",
        [input.personaId],
      );
      const persona = personas[0];
      if (!persona) throw new AppError("VALIDATION", "Select a valid persona before creating the tester.");
      const { rows } = await client.query(
        `insert into testers
           (name, email, department, persona, persona_id, access_code_hash, access_code_lookup)
         values ($1, $2, $3, $4, $5, $6, $7) returning *`,
        [input.name, input.email || null, input.department || null, persona.name, persona.id,
          hashAccessCodeForStorage(accessCode), hashAccessCodeForLookup(accessCode)],
      );
      return { tester: rows[0], accessCode };
    });
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError("VALIDATION", "Unable to create tester. The name or code may already be in use.");
  }
}

export async function createTestersBulk(inputRows: TesterRosterRow[]): Promise<{
  created: { name: string; email: string; department: string; persona: string; accessCode: string }[];
  errors: TesterRosterError[];
}> {
  if (inputRows.length === 0) return { created: [], errors: [{ rowNumber: 1, message: "No valid tester rows found." }] };
  if (inputRows.length > 100) {
    return { created: [], errors: [{ rowNumber: 1, message: "Import at most 100 testers per file." }] };
  }

  return withTransaction(async (client) => {
    await client.query("lock table testers in share row exclusive mode");
    const personaNames = [...new Set(inputRows.map((row) => row.persona.trim().toLowerCase()))];
    const { rows: personas } = await client.query<{ id: string; name: string }>(
      "select id, name from personas where lower(btrim(name)) = any($1::text[])",
      [personaNames],
    );
    const personaByName = new Map(personas.map((persona) => [persona.name.trim().toLowerCase(), persona]));
    const errors: TesterRosterError[] = [];

    for (const row of inputRows) {
      if (!personaByName.has(row.persona.trim().toLowerCase())) {
        errors.push({ rowNumber: row.rowNumber, message: `Persona "${row.persona}" is not configured.` });
      }
    }

    const emails = [...new Set(inputRows.map((row) => row.email.trim().toLowerCase()).filter(Boolean))];
    if (emails.length > 0) {
      const { rows: existing } = await client.query<{ email: string }>(
        "select lower(email) as email from testers where lower(email) = any($1::text[])",
        [emails],
      );
      const existingEmails = new Set(existing.map((row) => row.email));
      for (const row of inputRows) {
        const email = row.email.trim().toLowerCase();
        if (email && existingEmails.has(email)) {
          errors.push({ rowNumber: row.rowNumber, message: `Email "${row.email}" already belongs to a tester.` });
        }
      }
    }

    if (errors.length > 0) return { created: [], errors };

    const created: { name: string; email: string; department: string; persona: string; accessCode: string }[] = [];
    for (const row of inputRows) {
      const persona = personaByName.get(row.persona.trim().toLowerCase());
      if (!persona) throw new AppError("VALIDATION", "A selected persona is no longer available.");
      const accessCode = generateAccessCode();
      await client.query(
        `insert into testers
           (name, email, department, persona, persona_id, access_code_hash, access_code_lookup)
         values ($1, $2, $3, $4, $5, $6, $7)`,
        [row.name, row.email || null, row.department || null, persona.name, persona.id,
          hashAccessCodeForStorage(accessCode), hashAccessCodeForLookup(accessCode)],
      );
      created.push({ ...row, persona: persona.name, accessCode });
    }

    return { created, errors: [] };
  });
}

export async function updateTester(testerId: string, input: Partial<CreateTesterInput>) {
  const values: unknown[] = [];
  const assignments: string[] = [];
  const add = (column: string, value: unknown) => {
    values.push(value);
    assignments.push(`${column} = $${values.length}`);
  };
  if (input.name !== undefined) add("name", input.name);
  if (input.email !== undefined) add("email", input.email || null);
  if (input.department !== undefined) add("department", input.department || null);
  if (input.personaId !== undefined) {
    const { rows: personas } = await query<{ id: string; name: string }>(
      "select id, name from personas where id = $1",
      [input.personaId],
    );
    if (!personas[0]) throw new AppError("VALIDATION", "Select a valid persona.");
    add("persona", personas[0].name);
    add("persona_id", personas[0].id);
  }
  if (assignments.length === 0) throw new AppError("VALIDATION", "No tester changes were provided.");
  values.push(testerId);
  const { rows } = await query(
    `update testers set ${assignments.join(", ")} where id = $${values.length} returning *`,
    values,
  );
  if (!rows[0]) throw new AppError("VALIDATION", "Unable to update tester.");
  return rows[0];
}

export async function setTesterActive(testerId: string, isActive: boolean) {
  const { rows } = await query("update testers set is_active = $1 where id = $2 returning *", [isActive, testerId]);
  if (!rows[0]) throw new AppError("VALIDATION", "Unable to update tester status.");
  return rows[0];
}

export async function deleteTester(testerId: string): Promise<void> {
  await deleteTesters([testerId]);
}

export async function deleteTesters(testerIds: string[]): Promise<void> {
  const parsed = testerDeleteBatchSchema.safeParse(testerIds);
  if (!parsed.success) throw new AppError("VALIDATION", "Select 1 to 100 distinct valid tester IDs.");
  const ids = parsed.data;

  await withTransaction(async (client) => {
    /* SECURITY_NOTE: Parent FOR UPDATE locks block concurrent FK inserts; result locks
       serialize draft writes. Check after locking, before any cascading delete. */
    const { rows: testers } = await client.query<{ id: string }>(
      "select id from testers where id = any($1::uuid[]) order by id for update", [ids],
    );
    if (testers.length !== ids.length) {
      throw new AppError("NOT_FOUND", "A selected tester no longer exists. No testers were deleted.");
    }
    await client.query(
      "select id from assignments where tester_id = any($1::uuid[]) order by id for update", [ids],
    );
    await client.query(
      `select tr.id from test_results tr join assignments a on a.id = tr.assignment_id
       where a.tester_id = any($1::uuid[]) order by tr.id for update of tr`, [ids],
    );
    const { rows } = await client.query<{ protected: boolean }>(
      `with selected_assignments as (
         select id from assignments where tester_id = any($1::uuid[])
       ), selected_results as (
         select tr.* from test_results tr where tr.assignment_id in (select id from selected_assignments)
       )
       select (
         exists (
           select 1 from selected_results tr
           where tr.updated_at is distinct from tr.created_at
              or jsonb_strip_nulls(to_jsonb(tr) - array['id', 'assignment_id', 'created_at', 'updated_at'])
                 is distinct from '{"status":"Not Started","version":1}'::jsonb
         )
         or exists (select 1 from test_results where updated_by_tester_id = any($1::uuid[]))
         or exists (select 1 from result_history where test_result_id in (select id from selected_results)
                    or changed_by_tester_id = any($1::uuid[]))
         or exists (select 1 from evidence where test_result_id in (select id from selected_results)
                    or created_by_tester_id = any($1::uuid[]))
         or exists (select 1 from defects where test_result_id in (select id from selected_results)
                    or created_by_tester_id = any($1::uuid[])
                    or retest_assignment_id in (select id from selected_assignments))
         or exists (select 1 from comparisons where tester_id = any($1::uuid[]))
       ) as protected`, [ids],
    );
    if (rows[0]?.protected !== false) {
      throw new AppError("CONFLICT", "A selected tester has evaluation data or history. No testers were deleted. Deactivate them instead.");
    }
    const { rowCount } = await client.query("delete from testers where id = any($1::uuid[])", [ids]);
    if (rowCount !== ids.length) throw new AppError("CONFLICT", "Unable to delete all selected testers.");
  });
}

export async function resetAccessCode(testerId: string): Promise<string> {
  const accessCode = generateAccessCode();
  await withTransaction(async (client) => {
    const { rowCount } = await client.query(
      "update testers set access_code_hash = $1, access_code_lookup = $2 where id = $3",
      [hashAccessCodeForStorage(accessCode), hashAccessCodeForLookup(accessCode), testerId],
    );
    if (!rowCount) throw new AppError("VALIDATION", "Unable to reset access code.");
    await client.query(
      "update tester_sessions set revoked_at = now() where tester_id = $1 and revoked_at is null",
      [testerId],
    );
  });
  return accessCode;
}
