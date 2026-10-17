import { readFile } from "node:fs/promises";
import { AppError } from "@/lib/actionResult";
import { getAdminSession } from "@/lib/auth/adminSession";
import { getTesterSession } from "@/lib/auth/testerSession";
import { getEvidenceFile } from "@/lib/data/evidence";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const evidenceId = new URL(request.url).searchParams.get("id");
  if (!evidenceId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(evidenceId)) {
    return Response.json({ error: "Evidence file not found." }, { status: 404 });
  }

  try {
    const admin = await getAdminSession();
    const tester = admin ? null : await getTesterSession();
    if (!admin && !tester) return Response.json({ error: "Authentication required." }, { status: 401 });

    const file = await getEvidenceFile(evidenceId, { isAdmin: Boolean(admin), testerId: tester?.id });
    const contents = await readFile(file.filePath);
    const fallbackName = file.fileName.replace(/[^\x20-\x7e]|["\\]/g, "_");
    return new Response(contents, {
      headers: {
        "Content-Type": file.contentType,
        "Content-Disposition": `attachment; filename="${fallbackName}"; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
        "Content-Length": String(contents.byteLength),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
  } catch (error) {
    if (error instanceof AppError) {
      const status = error.code === "FORBIDDEN" ? 403 : error.code === "NOT_FOUND" ? 404 : 400;
      return Response.json({ error: error.message }, { status });
    }
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return Response.json({ error: "Evidence file not found." }, { status: 404 });
    }
    console.error("Evidence download failed.");
    return Response.json({ error: "Unable to download evidence." }, { status: 500 });
  }
}