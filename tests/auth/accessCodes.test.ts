import { describe, expect, it } from "vitest";
import {
  generateAccessCode,
  hashAccessCodeForLookup,
  hashAccessCodeForStorage,
  verifyAccessCode,
} from "@/lib/auth/accessCodes";

describe("access codes", () => {
  it("generates codes in the expected XXXX-XXXX shape", () => {
    const code = generateAccessCode();
    expect(code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$/);
  });

  it("verifies a correctly hashed code and rejects an incorrect one", () => {
    const code = generateAccessCode();
    const hash = hashAccessCodeForStorage(code);
    expect(verifyAccessCode(code, hash)).toBe(true);
    expect(verifyAccessCode("ZZZZ-ZZZZ", hash)).toBe(false);
  });

  it("is case/whitespace insensitive", () => {
    const code = "ab34-cd78";
    const hash = hashAccessCodeForStorage(code);
    expect(verifyAccessCode(" AB34-CD78 ", hash)).toBe(true);
  });

  it("produces a deterministic lookup hash for the same code", () => {
    const code = generateAccessCode();
    expect(hashAccessCodeForLookup(code)).toEqual(hashAccessCodeForLookup(code.toLowerCase()));
  });

  it("produces different lookup hashes for different codes", () => {
    expect(hashAccessCodeForLookup("AAAA-AAAA")).not.toEqual(hashAccessCodeForLookup("BBBB-BBBB"));
  });
});
