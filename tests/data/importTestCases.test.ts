import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PoolClient } from "pg";

const mocks = vi.hoisted(() => ({ query: vi.fn(), transaction: vi.fn() }));
vi.mock("@/lib/db/pool", () => ({
  query: mocks.query,
  withTransaction: mocks.transaction,
}));

import { commitTestCaseImport } from "@/lib/data/importTestCases";
import type { ImportedTestCaseRow } from "@/lib/validation/import";

const testCaseId = "00000000-0000-4000-8000-000000000001";

function importedRow(): ImportedTestCaseRow {
  return {
    testCaseId: "AI-01",
    functionalArea: "AI",
    persona: "Legal",
    scenario: "Review a contract",
    useCase: "Review a contract",
    suggestedSteps: "Open a contract",
    sirionSteps: "Review in Sirion",
    sirionFeature: "Clause analysis",
    sirionAvailability: "Available and Configured",
    ironcladSteps: "Review in Ironclad",
    ironcladFeature: "Workflow",
    ironcladAvailability: "Not Configured",
    expectedResult: "Relevant clauses are identified",
    requiredEvidence: undefined,
    sourceRowNumber: 2,
  };
}

describe("test-case catalog import", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.transaction.mockImplementation(async (work: (client: PoolClient) => Promise<unknown>) =>
      work({ query: mocks.query } as unknown as PoolClient));
  });

  it("archives omitted definitions and replaces persona mappings only for a full catalog", async () => {
    mocks.query
      .mockResolvedValueOnce({ rows: [{ id: testCaseId, inserted: false }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: "00000000-0000-4000-8000-000000000002" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rowCount: 5, rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await commitTestCaseImport([importedRow()], "catalog.csv", null, true);

    expect(result).toEqual({ createdCount: 0, updatedCount: 1, archivedCount: 5 });
    expect(mocks.query.mock.calls[0][0]).toContain("sirion_availability");
    expect(mocks.query.mock.calls[0][1][15]).toBe(true);
    expect(mocks.query.mock.calls[1][0]).toContain("delete from persona_test_cases where test_case_id = $1");
    expect(mocks.query.mock.calls[4][0]).toContain("set is_active = false");
    expect(mocks.query.mock.calls[5][0]).toContain("delete from persona_test_cases");
    expect(mocks.query.mock.calls.every(([sql]) => !/update test_results|delete from test_results|delete from assignments/i.test(sql))).toBe(true);
  });

  it("does not archive or reactivate cases for a legacy partial import", async () => {
    mocks.query
      .mockResolvedValueOnce({ rows: [{ id: testCaseId, inserted: false }] })
      .mockResolvedValueOnce({ rows: [{ id: "00000000-0000-4000-8000-000000000002" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await commitTestCaseImport([importedRow()], "legacy.xlsx", null, false);

    expect(result).toEqual({ createdCount: 0, updatedCount: 1, archivedCount: 0 });
    expect(mocks.query.mock.calls[0][1][15]).toBe(false);
    expect(mocks.query.mock.calls.some(([sql]) => /set is_active = false|delete from persona_test_cases where test_case_id/i.test(sql))).toBe(false);
  });

  it("rejects an empty full catalog before opening a transaction", async () => {
    await expect(commitTestCaseImport([], "empty.csv", null, true)).rejects.toThrow("must contain at least one valid test case");
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});