import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth/adminSession";
import { getExportRecords } from "@/lib/data/exportData";
import { buildCombinedWorkbook } from "@/lib/export/buildWorkbook";

export async function GET() {
  try {
    await requireAdminSession();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const records = await getExportRecords();
  const buffer = buildCombinedWorkbook(records);

  return new NextResponse(new Blob([new Uint8Array(buffer)]), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="clm-uat-combined-results.xlsx"`,
    },
  });
}
