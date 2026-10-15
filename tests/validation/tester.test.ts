import { describe, expect, it } from "vitest";
import { createTesterSchema } from "@/lib/validation/tester";

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
