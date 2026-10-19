import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/actionResult";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(), deleteOne: vi.fn(), deleteMany: vi.fn(), revalidate: vi.fn(),
}));
vi.mock("@/lib/auth/adminSession", () => ({ requireAdminSession: mocks.requireAdmin }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@/lib/data/testers", () => ({ deleteTester: mocks.deleteOne, deleteTesters: mocks.deleteMany }));

import { bulkDeleteTestersAction, deleteTesterAction } from "@/app/actions/admin/testers";

const testerId = "00000000-0000-4000-8000-000000000001";

describe("tester deletion actions", () => {
  beforeEach(() => vi.resetAllMocks());

  it.each(["single", "bulk"])("requires admin authorization for %s deletion", async (mode) => {
    mocks.requireAdmin.mockRejectedValue(new AppError("UNAUTHORIZED", "Admin access required."));
    const result = mode === "single" ? await deleteTesterAction(testerId) : await bulkDeleteTestersAction([testerId]);
    expect(result).toMatchObject({ ok: false, code: "UNAUTHORIZED" });
    expect(mocks.deleteOne).not.toHaveBeenCalled();
    expect(mocks.deleteMany).not.toHaveBeenCalled();
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });

  it("validates a single ID at runtime", async () => {
    expect(await deleteTesterAction("bad-id")).toMatchObject({ ok: false, code: "VALIDATION" });
    expect(mocks.deleteOne).not.toHaveBeenCalled();
  });

  it.each([[], ["bad-id"], [testerId, testerId], Array(101).fill(testerId)])("rejects invalid batches before the data layer: %j", async (ids) => {
    expect(await bulkDeleteTestersAction(ids)).toMatchObject({ ok: false, code: "VALIDATION" });
    expect(mocks.deleteMany).not.toHaveBeenCalled();
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });

  it.each(["single", "bulk"])("returns history protection failures without invalidating caches: %s", async (mode) => {
    const error = new AppError("CONFLICT", "Evaluation history is protected.");
    mocks.deleteOne.mockRejectedValue(error);
    mocks.deleteMany.mockRejectedValue(error);
    const result = mode === "single" ? await deleteTesterAction(testerId) : await bulkDeleteTestersAction([testerId]);
    expect(result).toMatchObject({ ok: false, code: "CONFLICT", error: error.message });
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });

  it.each(["single", "bulk"])("invalidates admin pages only after successful deletion: %s", async (mode) => {
    const result = mode === "single" ? await deleteTesterAction(testerId) : await bulkDeleteTestersAction([testerId]);
    expect(result).toEqual({ ok: true, data: null });
    expect(mode === "single" ? mocks.deleteOne : mocks.deleteMany).toHaveBeenCalledWith(mode === "single" ? testerId : [testerId]);
    expect(mocks.revalidate.mock.calls).toEqual([["/admin/testers"], ["/admin/assignments"], ["/admin"]]);
  });
});