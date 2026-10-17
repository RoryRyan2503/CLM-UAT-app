import "server-only";
import { query, withTransaction } from "@/lib/db/pool";
import { AppError } from "@/lib/actionResult";
import { generateAccessCode, hashAccessCodeForLookup, hashAccessCodeForStorage } from "@/lib/auth/accessCodes";
import type { CreateTesterInput } from "@/lib/validation/tester";
import type { Database } from "@/lib/types/database";

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
  const { rowCount } = await query("delete from testers where id = $1", [testerId]);
  if (!rowCount) throw new AppError("VALIDATION", "Unable to delete tester.");
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
