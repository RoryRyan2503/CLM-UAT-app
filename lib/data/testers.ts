import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/adminClient";
import { AppError } from "@/lib/actionResult";
import { generateAccessCode, hashAccessCodeForLookup, hashAccessCodeForStorage } from "@/lib/auth/accessCodes";
import type { CreateTesterInput } from "@/lib/validation/tester";

export async function listTesters() {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.from("testers").select("*").order("created_at", { ascending: false });
  if (error) throw new AppError("NOT_FOUND", "Unable to load testers.");
  return data ?? [];
}

export async function listPersonas() {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.from("personas").select("id, name").order("name");
  if (error) throw new AppError("NOT_FOUND", "Unable to load personas.");
  return data ?? [];
}

/** Returns the plaintext code once; only the hash is persisted. */
export async function createTester(input: CreateTesterInput): Promise<{ tester: unknown; accessCode: string }> {
  const supabase = createSupabaseAdminClient();
  const accessCode = generateAccessCode();
  const { data: persona, error: personaError } = await supabase
    .from("personas")
    .select("id, name")
    .eq("id", input.personaId)
    .maybeSingle();
  if (personaError || !persona) throw new AppError("VALIDATION", "Select a valid persona before creating the tester.");

  const { data, error } = await supabase
    .from("testers")
    .insert({
      name: input.name,
      email: input.email || null,
      department: input.department || null,
      persona: persona.name,
      persona_id: persona.id,
      access_code_hash: hashAccessCodeForStorage(accessCode),
      access_code_lookup: hashAccessCodeForLookup(accessCode),
    })
    .select("*")
    .maybeSingle();

  if (error || !data) throw new AppError("VALIDATION", "Unable to create tester. The name or code may already be in use.");
  return { tester: data, accessCode };
}

export async function updateTester(testerId: string, input: Partial<CreateTesterInput>) {
  const supabase = createSupabaseAdminClient();
  let personaUpdate: { persona?: string; persona_id?: string } = {};
  if (input.personaId !== undefined) {
    const { data: persona, error: personaError } = await supabase
      .from("personas")
      .select("id, name")
      .eq("id", input.personaId)
      .maybeSingle();
    if (personaError || !persona) throw new AppError("VALIDATION", "Select a valid persona.");
    personaUpdate = { persona: persona.name, persona_id: persona.id };
  }
  const { data, error } = await supabase
    .from("testers")
    .update({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.email !== undefined ? { email: input.email || null } : {}),
      ...(input.department !== undefined ? { department: input.department || null } : {}),
      ...personaUpdate,
    })
    .eq("id", testerId)
    .select("*")
    .maybeSingle();
  if (error || !data) throw new AppError("VALIDATION", "Unable to update tester.");
  return data;
}

export async function setTesterActive(testerId: string, isActive: boolean) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("testers")
    .update({ is_active: isActive })
    .eq("id", testerId)
    .select("*")
    .maybeSingle();
  if (error || !data) throw new AppError("VALIDATION", "Unable to update tester status.");
  return data;
}

export async function deleteTester(testerId: string): Promise<void> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("testers")
    .delete()
    .eq("id", testerId)
    .select("id")
    .maybeSingle();

  if (error || !data) throw new AppError("VALIDATION", "Unable to delete tester.");
}

export async function resetAccessCode(testerId: string): Promise<string> {
  const supabase = createSupabaseAdminClient();
  const accessCode = generateAccessCode();
  const { error } = await supabase
    .from("testers")
    .update({
      access_code_hash: hashAccessCodeForStorage(accessCode),
      access_code_lookup: hashAccessCodeForLookup(accessCode),
    })
    .eq("id", testerId);
  if (error) throw new AppError("VALIDATION", "Unable to reset access code.");

  // Revoke existing sessions so the old code's session can't continue to be used.
  await supabase
    .from("tester_sessions")
    .update({ revoked_at: new Date().toISOString() })
    .eq("tester_id", testerId)
    .is("revoked_at", null);

  return accessCode;
}
