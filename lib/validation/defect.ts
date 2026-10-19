import { z } from "zod";
import { SEVERITY_VALUES } from "@/lib/constants";

const defectFields = {
  testResultId: z.string().uuid(),
  vendorId: z.string().uuid(),
  title: z.string().trim().min(1, "A defect title is required.").max(300),
  description: z.string().trim().max(10_000).optional(),
  severity: z.union([z.enum(SEVERITY_VALUES), z.literal("")]).optional(),
};

export const createDefectSchema = z.object(defectFields);
export const updateDefectSchema = z.object({ ...defectFields, defectId: z.string().uuid() });

export type DefectInput = z.infer<typeof createDefectSchema>;