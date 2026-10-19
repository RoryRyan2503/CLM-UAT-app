import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PoolClient } from "pg";

const mocks = vi.hoisted(() => ({ query: vi.fn(), transaction: vi.fn() }));
vi.mock("@/lib/db/pool", () => ({
  query: mocks.query,
  withTransaction: mocks.transaction,
}));

import { applyPersonaDefaultsToTesters, setTesterCases } from "@/lib/data/adminAssignments";

const testerId = "00000000-0000-4000-8000-000000000001";
const testCaseId = "00000000-0000-4000-8000-000000000002";
const vendorId = "00000000-0000-4000-8000-000000000003";
const assignmentId = "00000000-0000-4000-8000-000000000004";
const secondTesterId = "00000000-0000-4000-8000-000000000005";
const personaId = "00000000-0000-4000-8000-000000000006";
const secondPersonaId = "00000000-0000-4000-8000-000000000007";
const secondCaseId = "00000000-0000-4000-8000-000000000008";

describe("archived test-case assignments", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.transaction.mockImplementation(async (work: (client: PoolClient) => Promise<unknown>) =>
      work({ query: mocks.query } as unknown as PoolClient));
  });

  it("rejects adding an archived test case", async () => {
    mocks.query
      .mockResolvedValueOnce({ rows: [{ id: testerId, is_active: true }] })
      .mockResolvedValueOnce({ rows: [{ id: vendorId }] })
      .mockResolvedValueOnce({ rows: [{ id: testCaseId, is_active: false }] });

    await expect(setTesterCases(testerId, [testCaseId], true)).rejects.toMatchObject({ code: "VALIDATION" });
    expect(mocks.query.mock.calls.some(([sql]) => /insert into assignments/i.test(sql))).toBe(false);
  });

  it("allows an existing assignment to be deactivated after its case is archived", async () => {
    mocks.query
      .mockResolvedValueOnce({ rows: [{ id: testerId, is_active: true }] })
      .mockResolvedValueOnce({ rows: [{ id: vendorId }] })
      .mockResolvedValueOnce({ rows: [{ id: testCaseId, is_active: false }] })
      .mockResolvedValueOnce({ rows: [{ id: assignmentId, test_case_id: testCaseId, vendor_id: vendorId, is_active: true }] })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    await expect(setTesterCases(testerId, [testCaseId], false)).resolves.toEqual({ assignmentsChanged: 1 });
    expect(mocks.query.mock.calls[4][0]).toContain("update assignments set is_active = false");
  });
});

describe("bulk persona assignments", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.transaction.mockImplementation(async (work: (client: PoolClient) => Promise<unknown>) =>
      work({ query: mocks.query } as unknown as PoolClient));
  });

  it("applies each selected tester's own persona defaults in one transaction", async () => {
    mocks.query
      .mockResolvedValueOnce({ rows: [{ id: testerId, persona_id: personaId }, { id: secondTesterId, persona_id: secondPersonaId }] })
      .mockResolvedValueOnce({ rows: [{ id: vendorId }, { id: "00000000-0000-4000-8000-000000000009" }] })
      .mockResolvedValueOnce({ rows: [{ persona_id: personaId, test_case_id: testCaseId }, { persona_id: secondPersonaId, test_case_id: secondCaseId }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: Array.from({ length: 4 }, (_, index) => ({ id: `00000000-0000-4000-8000-${String(index + 10).padStart(12, "0")}` })) })
      .mockResolvedValueOnce({ rows: [] });

    await expect(applyPersonaDefaultsToTesters([testerId, secondTesterId])).resolves.toEqual({
      testersApplied: 2,
      testersSkipped: 0,
      casesAdded: 2,
    });
    expect(mocks.query.mock.calls[4][0]).toContain("insert into assignments");
    expect(mocks.query.mock.calls[4][1][0]).toEqual([testerId, testerId, secondTesterId, secondTesterId]);
    expect(mocks.query.mock.calls[5][0]).toContain("insert into test_results");
  });

  it("skips testers with no configured persona defaults", async () => {
    mocks.query
      .mockResolvedValueOnce({ rows: [{ id: testerId, persona_id: null }] })
      .mockResolvedValueOnce({ rows: [{ id: vendorId }] })
      .mockResolvedValueOnce({ rows: [] });

    await expect(applyPersonaDefaultsToTesters([testerId])).resolves.toEqual({
      testersApplied: 0,
      testersSkipped: 1,
      casesAdded: 0,
    });
    expect(mocks.query).toHaveBeenCalledTimes(2);
  });
});