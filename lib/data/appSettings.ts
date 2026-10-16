import "server-only";
import { AppError } from "@/lib/actionResult";
import { createSupabaseAdminClient } from "@/lib/supabase/adminClient";

export async function getEvidenceEnabled(): Promise<boolean> {
  const { data, error } = await createSupabaseAdminClient()
    .from("app_settings")
    .select("evidence_enabled")
    .eq("id", 1)
    .maybeSingle();

  if (error || !data) throw new AppError("VALIDATION", "Unable to load application settings.");
  return data.evidence_enabled;
}

export async function setEvidenceEnabled(enabled: boolean): Promise<void> {
  const { error } = await createSupabaseAdminClient()
    .from("app_settings")
    .update({ evidence_enabled: enabled, updated_at: new Date().toISOString() })
    .eq("id", 1);

  if (error) throw new AppError("VALIDATION", "Unable to save evidence settings.");
}
