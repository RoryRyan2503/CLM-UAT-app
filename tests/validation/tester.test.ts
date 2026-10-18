import { describe, expect, it } from "vitest";
import { createTesterSchema, testerLoginSchema } from "@/lib/validation/tester";

describe("testerLoginSchema", () => {
  it("accepts either a tester name or an email as the login identifier", () => {
    expect(testerLoginSchema.safeParse({ identifier: "Jordan Tester", accessCode: "ABCD-2345" }).success).toBe(true);
    expect(testerLoginSchema.safeParse({ identifier: "jordan@example.com", accessCode: "ABCD-2345" }).success).toBe(true);
  });

  it("requires both an identifier and an access code", () => {
    expect(testerLoginSchema.safeParse({ identifier: "", accessCode: "ABCD-2345" }).success).toBe(false);
    expect(testerLoginSchema.safeParse({ identifier: "Jordan Tester", accessCode: "" }).success).toBe(false);
  });
});

describe("createTesterSchema", () => {
  it("requires a valid configured persona id", () => {
    const missing = createTesterSchema.safeParse({ name: "Jordan Tester" });
    expect(missing.success).toBe(false);

    const invalid = createTesterSchema.safeParse({ name: "Jordan Tester", personaId: "not-a-uuid" });
    expect(invalid.success).toBe(false);

    const valid = createTesterSchema.safeParse({
      name: "Jordan Tester",
      email: "jordan@example.com",
      department: "Legal",
      personaId: "e16c05a7-4324-43c7-bf26-9e587df89006",
    });
    expect(valid.success).toBe(true);
  });
});
