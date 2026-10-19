import "server-only";
import { AppError } from "@/lib/actionResult";
import { query } from "@/lib/db/pool";

export type EvidenceMode = "disabled" | "sharepoint" | "upload";

export async function getEvidenceMode(): Promise<EvidenceMode> {
  const { rows } = await query<{ evidence_mode: EvidenceMode }>(
    "select evidence_mode from app_settings where id = 1",
  );
  if (!rows[0]) throw new AppError("VALIDATION", "Unable to load application settings.");
  return rows[0].evidence_mode;
}

export async function setEvidenceMode(mode: EvidenceMode): Promise<void> {
  const { rowCount } = await query(
    "update app_settings set evidence_mode = $1, evidence_enabled = ($1 <> 'disabled'), updated_at = now() where id = 1",
    [mode],
  );
  if (!rowCount) throw new AppError("VALIDATION", "Unable to save evidence settings.");
}
