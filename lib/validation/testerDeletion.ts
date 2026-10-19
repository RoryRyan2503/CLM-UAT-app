import { z } from "zod";

export const MAX_TESTER_DELETE_BATCH = 100;
export const testerIdSchema = z.uuid();
export const testerDeleteBatchSchema = z.array(testerIdSchema).min(1).max(MAX_TESTER_DELETE_BATCH)
  .refine((ids) => new Set(ids.map((id) => id.toLowerCase())).size === ids.length, "Duplicate tester IDs.")
  .transform((ids) => ids.map((id) => id.toLowerCase()).sort());