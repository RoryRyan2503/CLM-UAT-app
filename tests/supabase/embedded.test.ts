import { describe, expect, it } from "vitest";
import { embeddedOne } from "@/lib/supabase/embedded";

describe("embeddedOne", () => {
  it("returns a row embedded as an object", () => {
    const row = { status: "Pass" };
    expect(embeddedOne(row)).toBe(row);
  });

  it("returns the first row embedded as an array", () => {
    expect(embeddedOne([{ status: "Pass" }])).toEqual({ status: "Pass" });
  });

  it("returns null for a missing one-to-one embed", () => {
    expect(embeddedOne(null)).toBeNull();
  });
});
