import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PoolClient } from "pg";

const mocks = vi.hoisted(() => ({ query: vi.fn(), transaction: vi.fn() }));
vi.mock("@/lib/db/pool", () => ({
  query: mocks.query,
  withTransaction: mocks.transaction,
}));

import { setTesterCases } from "@/lib/data/adminAssignments";

const testerId = "00000000-0000-4000-8000-000000000001";
const testCaseId = "00000000-0000-4000-8000-000000000002";
const vendorId = "00000000-0000-4000-8000-000000000003";
const assignmentId = "00000000-0000-4000-8000-000000000004";

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