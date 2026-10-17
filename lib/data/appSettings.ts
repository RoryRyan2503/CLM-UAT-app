import "server-only";
import { AppError } from "@/lib/actionResult";
import { query } from "@/lib/db/pool";

export async function getEvidenceEnabled(): Promise<boolean> {
  const { rows } = await query<{ evidence_enabled: boolean }>(
    "select evidence_enabled from app_settings where id = 1",
  );
  if (!rows[0]) throw new AppError("VALIDATION", "Unable to load application settings.");
  return rows[0].evidence_enabled;
}

export async function setEvidenceEnabled(enabled: boolean): Promise<void> {
  const { rowCount } = await query(
    "update app_settings set evidence_enabled = $1, updated_at = now() where id = 1",
    [enabled],
  );
  if (!rowCount) throw new AppError("VALIDATION", "Unable to save evidence settings.");
}
