import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ query: vi.fn(), getEvidenceMode: vi.fn() }));
vi.mock("@/lib/db/pool", () => ({ query: mocks.query }));
vi.mock("@/lib/data/appSettings", () => ({ getEvidenceMode: mocks.getEvidenceMode }));

import { registerEvidenceUrl, uploadEvidenceFile } from "@/lib/data/evidence";

const testerId = "00000000-0000-4000-8000-000000000001";
const resultId = "00000000-0000-4000-8000-000000000002";
const evidenceId = "00000000-0000-4000-8000-000000000003";

function mockOwnedResult() {
  mocks.query.mockResolvedValueOnce({ rows: [{ id: resultId, tester_id: testerId, is_active: true }] });
}

describe("evidence mode enforcement", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("registers HTTPS SharePoint links only when link mode is selected", async () => {
    mocks.getEvidenceMode.mockResolvedValue("sharepoint");
    mockOwnedResult();
    mocks.query.mockResolvedValueOnce({ rows: [{ id: evidenceId, test_result_id: resultId, kind: "url", url: "https://tenant.sharepoint.com/sites/legal/file" }] });

    const evidence = await registerEvidenceUrl(testerId, resultId, "https://tenant.sharepoint.com/sites/legal/file");

    expect(evidence.kind).toBe("url");
    expect(mocks.query.mock.calls[1][0]).toContain("insert into evidence");
  });

  it("rejects URL creation when the selected mode is server upload", async () => {
    mocks.getEvidenceMode.mockResolvedValue("upload");
    mockOwnedResult();

    await expect(registerEvidenceUrl(testerId, resultId, "https://tenant.sharepoint.com/file"))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.query).toHaveBeenCalledTimes(1);
  });

  it("rejects non-SharePoint or non-HTTPS URLs", async () => {
    mocks.getEvidenceMode.mockResolvedValue("sharepoint");
    mockOwnedResult();

    await expect(registerEvidenceUrl(testerId, resultId, "http://tenant.sharepoint.com/file"))
      .rejects.toMatchObject({ code: "VALIDATION" });
    expect(mocks.query).toHaveBeenCalledTimes(1);
  });

  it("rejects direct uploads when link-only mode is selected", async () => {
    mocks.getEvidenceMode.mockResolvedValue("sharepoint");
    mockOwnedResult();

    await expect(uploadEvidenceFile(testerId, resultId, {} as File))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.query).toHaveBeenCalledTimes(1);
  });
});
