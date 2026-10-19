import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PoolClient } from "pg";

const mocks = vi.hoisted(() => ({ query: vi.fn(), transaction: vi.fn(), directQuery: vi.fn() }));
vi.mock("@/lib/db/pool", () => ({ query: mocks.directQuery, withTransaction: mocks.transaction }));

import { deleteTester, deleteTesters } from "@/lib/data/testers";

const firstId = "00000000-0000-4000-8000-000000000001";
const secondId = "00000000-0000-4000-8000-000000000002";

describe("guarded tester deletion", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.transaction.mockImplementation(async (work: (client: PoolClient) => Promise<void>) =>
      work({ query: mocks.query } as unknown as PoolClient));
    mocks.query.mockResolvedValue({ rows: [], rowCount: 0 });
  });

  function prepare(ids: string[], protectedData: boolean) {
    mocks.query.mockResolvedValueOnce({ rows: ids.map((id) => ({ id })) })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ protected: protectedData }] })
      .mockResolvedValueOnce({ rowCount: ids.length });
  }

  it("locks parents and results before checking and deleting pristine testers", async () => {
    prepare([firstId, secondId], false);
    await deleteTesters([secondId, firstId]);
    const statements = mocks.query.mock.calls.map(([sql]) => sql as string);
    expect(statements[0]).toMatch(/testers.*for update/);
    expect(statements[1]).toMatch(/assignments.*for update/);
    expect(statements[2]).toContain("for update of tr");
    expect(statements[3]).toContain("jsonb_strip_nulls");
    for (const table of ["result_history", "evidence", "defects", "comparisons"]) {
      expect(statements[3]).toContain(`from ${table}`);
    }
    expect(statements[4]).toMatch(/^delete from testers/);
    expect(mocks.query.mock.calls.every(([, values]) => JSON.stringify(values) === JSON.stringify([[firstId, secondId]]))).toBe(true);
    expect(mocks.directQuery).not.toHaveBeenCalled();
  });

  it("rejects the entire mixed batch without issuing any delete", async () => {
    prepare([firstId, secondId], true);
    await expect(deleteTesters([firstId, secondId])).rejects.toMatchObject({ code: "CONFLICT" });
    expect(mocks.query).toHaveBeenCalledTimes(4);
    expect(mocks.query.mock.calls.some(([sql]) => /^delete/i.test(sql))).toBe(false);
  });

  it("uses the same protection for a single tester", async () => {
    prepare([firstId], true);
    await expect(deleteTester(firstId)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(mocks.query).toHaveBeenCalledTimes(4);
  });

  it("rejects missing testers without deleting the other requested tester", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [{ id: firstId }] });
    await expect(deleteTesters([firstId, secondId])).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mocks.query).toHaveBeenCalledTimes(1);
  });

  it.each([[], ["invalid"], [firstId, firstId], Array(101).fill(firstId)])("rejects invalid batch %j before the transaction", async (ids) => {
    await expect(deleteTesters(ids)).rejects.toMatchObject({ code: "VALIDATION" });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("fails closed if the protection check has no result", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [{ id: firstId }] });
    await expect(deleteTester(firstId)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(mocks.query).toHaveBeenCalledTimes(4);
  });

  it("throws on an incomplete delete so the transaction rolls back", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [{ id: firstId }] })
      .mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ protected: false }] }).mockResolvedValueOnce({ rowCount: 0 });
    await expect(deleteTester(firstId)).rejects.toMatchObject({ code: "CONFLICT" });
  });
});