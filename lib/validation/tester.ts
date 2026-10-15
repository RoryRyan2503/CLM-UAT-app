import { z } from "zod";

export const testerLoginSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(200),
  accessCode: z
    .string()
    .trim()
    .min(4, "Access code is required.")
    .max(32),
});

export const createTesterSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(200),
  email: z.string().trim().email().max(320).optional().or(z.literal("")),
  department: z.string().trim().max(200).optional().or(z.literal("")),
  personaId: z.string().uuid("Select a configured persona."),
});

export type CreateTesterInput = z.infer<typeof createTesterSchema>;
export type TesterLoginInput = z.infer<typeof testerLoginSchema>;
