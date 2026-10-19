import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PoolClient } from "pg";

const mocks = vi.hoisted(() => ({ query: vi.fn(), transaction: vi.fn() }));
vi.mock("@/lib/db/pool", () => ({
  query: mocks.query,
  withTransaction: mocks.transaction,
}));

import { createDefect, updateDefect } from "@/lib/data/defects";

const ids = {
  tester: "00000000-0000-4000-8000-000000000001",
  result: "00000000-0000-4000-8000-000000000002",
  vendor: "00000000-0000-4000-8000-000000000003",
  defect: "00000000-0000-4000-8000-000000000004",
};

const defectRow = {
  id: ids.defect,
  defect_code: "DEF-0001",
  test_result_id: ids.result,
  vendor_id: ids.vendor,
  title: "Cannot save",
  description: "Save fails",
  severity: "High",
  status: "Open",
  retest_assignment_id: null,
  created_by_tester_id: ids.tester,
  created_at: "2026-10-19T10:00:00.000Z",
  updated_at: "2026-10-19T10:00:00.000Z",
};

describe("tester defect persistence", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.transaction.mockImplementation(async (work: (client: PoolClient) => Promise<unknown>) =>
      work({ query: mocks.query } as unknown as PoolClient));
  });

  it("creates a tool-matched defect, links it to the result and records the versioned history", async () => {
    mocks.query
      .mockResolvedValueOnce({ rows: [{ id: ids.result, version: 1, defect_id: null, vendor_id: ids.vendor, tester_id: ids.tester, is_active: true }] })
      .mockResolvedValueOnce({ rows: [{ defect_code: "DEF-0001" }] })
      .mockResolvedValueOnce({ rows: [defectRow] })
      .mockResolvedValueOnce({ rows: [{ id: ids.result, version: 2 }] })
      .mockResolvedValueOnce({ rows: [] });

    const created = await createDefect(ids.tester, {
      testResultId: ids.result,
      vendorId: ids.vendor,
      title: "Cannot save",
      description: "Save fails",
      severity: "High",
    });

    expect(created).toEqual({ defect: defectRow, resultVersion: 2 });
    expect(mocks.query.mock.calls[2][0]).toContain("insert into defects");
    expect(mocks.query.mock.calls[3][0]).toContain("set defect_id = $1, version = version + 1");
    expect(mocks.query.mock.calls[3][1]).toEqual([ids.defect, ids.tester, ids.result]);
    expect(mocks.query.mock.calls[4][0]).toContain("'defect_link'");
  });

  it("does not create a defect when its tool does not match the assigned tool", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [{
      id: ids.result, version: 1, defect_id: null, vendor_id: "00000000-0000-4000-8000-000000000099",
      tester_id: ids.tester, is_active: true,
    }] });

    await expect(createDefect(ids.tester, {
      testResultId: ids.result,
      vendorId: ids.vendor,
      title: "Mismatch",
    })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.query).toHaveBeenCalledTimes(1);
  });

  it("edits and links a legacy defect that existed without test_results.defect_id", async () => {
    const updatedDefect = { ...defectRow, title: "Cannot save changes" };
    mocks.query
      .mockResolvedValueOnce({ rows: [{ defect_id: ids.defect, linked_defect_id: null, vendor_id: ids.vendor,
        tester_id: ids.tester, is_active: true, result_id: ids.result, version: 1,
        title: defectRow.title, description: defectRow.description, severity: defectRow.severity }] })
      .mockResolvedValueOnce({ rows: [updatedDefect] })
      .mockResolvedValueOnce({ rows: [{ id: ids.result, version: 2 }] })
      .mockResolvedValueOnce({ rows: [] });

    const saved = await updateDefect(ids.tester, {
      defectId: ids.defect,
      testResultId: ids.result,
      vendorId: ids.vendor,
      title: "Cannot save changes",
      description: "Still fails",
      severity: "High",
    });

    expect(saved).toEqual({ defect: updatedDefect, resultVersion: 2 });
    expect(mocks.query.mock.calls[2][0]).toContain("set defect_id = $1");
    expect(mocks.query.mock.calls[2][1]).toEqual([ids.defect, ids.tester, ids.result]);
    expect(mocks.query.mock.calls[3][0]).toContain("'defect_update'");
    expect(mocks.query.mock.calls[3][1][2]).toContain('"defect_id":null');
  });
});