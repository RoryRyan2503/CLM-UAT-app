import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/adminClient";
import { AppError } from "@/lib/actionResult";
import { EVIDENCE_BUCKET } from "@/lib/constants";

async function assertTesterOwnsResult(testerId: string, testResultId: string) {
  const supabase = createSupabaseAdminClient();
  const { data } = await supabase
    .from("test_results")
    .select("id, assignment_id, assignments(tester_id, is_active)")
    .eq("id", testResultId)
    .maybeSingle();

  type Row = { assignments: { tester_id: string; is_active: boolean } | null };
  const assignment = (data as unknown as Row | null)?.assignments;
  if (!assignment || assignment.tester_id !== testerId || !assignment.is_active) {
    throw new AppError("FORBIDDEN", "You may only attach evidence to your own results.");
  }
  return supabase;
}

export async function createEvidenceUploadUrl(testerId: string, testResultId: string, fileName: string) {
  const supabase = await assertTesterOwnsResult(testerId, testResultId);
  const safeName = fileName.replace(/[^a-zA-Z0-9_.-]/g, "_");
  const path = `${testResultId}/${Date.now()}-${safeName}`;

  const { data, error } = await supabase.storage.from(EVIDENCE_BUCKET).createSignedUploadUrl(path);
  if (error || !data) throw new AppError("VALIDATION", "Unable to prepare upload.");

  return { path, token: data.token, signedUrl: data.signedUrl };
}

export async function registerEvidenceFile(
  testerId: string,
  testResultId: string,
  params: { path: string; fileName: string; mimeType: string; sizeBytes: number },
) {
  const supabase = await assertTesterOwnsResult(testerId, testResultId);
  const { data, error } = await supabase
    .from("evidence")
    .insert({
      test_result_id: testResultId,
      kind: "file",
      storage_path: params.path,
      file_name: params.fileName,
      mime_type: params.mimeType,
      size_bytes: params.sizeBytes,
      created_by_tester_id: testerId,
    })
    .select("*")
    .maybeSingle();
  if (error || !data) throw new AppError("VALIDATION", "Unable to save evidence record.");
  return data;
}

export async function registerEvidenceUrl(testerId: string, testResultId: string, url: string) {
  const supabase = await assertTesterOwnsResult(testerId, testResultId);
  const { data, error } = await supabase
    .from("evidence")
    .insert({ test_result_id: testResultId, kind: "url", url, created_by_tester_id: testerId })
    .select("*")
    .maybeSingle();
  if (error || !data) throw new AppError("VALIDATION", "Unable to save evidence link.");
  return data;
}

export async function getSignedEvidenceUrl(evidenceId: string, opts: { testerId?: string; isAdmin?: boolean }) {
  const supabase = createSupabaseAdminClient();
  const { data } = await supabase
    .from("evidence")
    .select("storage_path, test_results(assignments(tester_id, is_active))")
    .eq("id", evidenceId)
    .maybeSingle();

  type Row = {
    storage_path: string | null;
    test_results: { assignments: { tester_id: string; is_active: boolean } | null } | null;
  };
  const evidence = data as unknown as Row | null;
  const ownerTesterId = evidence?.test_results?.assignments?.tester_id;
  const assignmentIsActive = evidence?.test_results?.assignments?.is_active;

  if (!evidence?.storage_path) throw new AppError("NOT_FOUND", "Evidence file not found.");
  if (!opts.isAdmin && (ownerTesterId !== opts.testerId || !assignmentIsActive)) {
    throw new AppError("FORBIDDEN", "You do not have access to this evidence file.");
  }

  const { data: signed, error } = await supabase.storage
    .from(EVIDENCE_BUCKET)
    .createSignedUrl(evidence.storage_path, 60 * 5);
  if (error || !signed) throw new AppError("VALIDATION", "Unable to generate a link for this file.");
  return signed.signedUrl;
}
