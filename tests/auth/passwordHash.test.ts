import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/auth/passwordHash";

describe("admin password hashing", () => {
  it("verifies passwords using salted scrypt hashes", async () => {
    const hash = await hashPassword("correct horse battery staple");

    expect(hash).toMatch(/^scrypt\$16384\$8\$1\$/);
    expect(await verifyPassword("correct horse battery staple", hash)).toBe(true);
    expect(await verifyPassword("incorrect password", hash)).toBe(false);
  });

  it("rejects malformed hashes", async () => {
    expect(await verifyPassword("password", "not-a-hash")).toBe(false);
  });
});