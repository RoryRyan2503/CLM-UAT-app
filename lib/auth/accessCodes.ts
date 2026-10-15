import "server-only";
import { randomBytes, createHmac, timingSafeEqual, scryptSync } from "node:crypto";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I to avoid transcription errors

function getPepper(): string {
  const pepper = process.env.ACCESS_CODE_PEPPER;
  if (!pepper) {
    throw new Error("ACCESS_CODE_PEPPER is not configured.");
  }
  return pepper;
}

/** Generates a high-entropy, human-transcribable access code like "7K4P-QX9H". */
export function generateAccessCode(): string {
  const bytes = randomBytes(8);
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

/** Deterministic keyed lookup hash (HMAC-SHA256 with server-only pepper) for O(1) indexed lookup. */
export function hashAccessCodeForLookup(code: string): string {
  return createHmac("sha256", getPepper()).update(normalizeCode(code)).digest("hex");
}

/** Slow, salted verification hash stored alongside the lookup hash; this is what proves possession. */
export function hashAccessCodeForStorage(code: string): string {
  const salt = randomBytes(16);
  const derived = scryptSync(normalizeCode(code), salt, 64);
  return `${salt.toString("hex")}:${derived.toString("hex")}`;
}

export function verifyAccessCode(code: string, storedHash: string): boolean {
  const [saltHex, hashHex] = storedHash.split(":");
  if (!saltHex || !hashHex) return false;
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  const actual = scryptSync(normalizeCode(code), salt, 64);
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

function normalizeCode(code: string): string {
  return code.trim().toUpperCase().replace(/\s+/g, "");
}
