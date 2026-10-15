import { z } from "zod";
import { PREFERRED_VENDOR_VALUES } from "@/lib/constants";

export const comparisonSchema = z.object({
  testerId: z.string().uuid(),
  testCaseId: z.string().uuid(),
  version: z.number().int().nonnegative(),
  preferredVendor: z.enum(PREFERRED_VENDOR_VALUES).nullable(),
  comments: z.string().max(10000).optional().nullable(),
});

export type ComparisonInput = z.infer<typeof comparisonSchema>;
