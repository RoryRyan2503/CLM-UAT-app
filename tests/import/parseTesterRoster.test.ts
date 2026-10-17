import { describe, expect, it } from "vitest";
import { parseTesterRoster } from "@/lib/import/parseTesterRoster";

describe("parseTesterRoster", () => {
  it("parses tester rows with optional fields and exact persona names", () => {
    const csv = [
      "Name,Email,Department,Persona",
      'Ada Lovelace,ada@example.com,Legal,Contract Reviewer',
      "Grace Hopper,,,Administrator",
    ].join("\n");

    expect(parseTesterRoster(Buffer.from(csv), "testers.csv")).toEqual({
      rows: [
        { name: "Ada Lovelace", email: "ada@example.com", department: "Legal", persona: "Contract Reviewer", rowNumber: 2 },
        { name: "Grace Hopper", email: "", department: "", persona: "Administrator", rowNumber: 3 },
      ],
      errors: [],
    });
  });

  it("reports invalid rows and duplicate emails without dropping the first email", () => {
    const csv = [
      "Full Name,Email Address,Team,Persona",
      "Ada Lovelace,ada@example.com,Legal,Reviewer",
      "Grace Hopper,ADA@example.com,IT,Reviewer",
      "Missing Persona,missing@example.com,Legal,",
    ].join("\n");

    const parsed = parseTesterRoster(Buffer.from(csv), "testers.csv");
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.errors).toEqual([
      { rowNumber: 3, message: "Email duplicates row 2." },
      { rowNumber: 4, message: "Persona is required." },
    ]);
  });

  it("rejects files without the required headers", () => {
    expect(() => parseTesterRoster(Buffer.from("First,Last\nAda,Lovelace"), "testers.csv"))
      .toThrow("Could not find Name and Persona columns");
  });
});