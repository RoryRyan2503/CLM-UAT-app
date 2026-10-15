import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth/adminSession";
import { getExportRecords } from "@/lib/data/exportData";
import { buildVendorWorkbook } from "@/lib/export/buildWorkbook";

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    await requireAdminSession();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { slug } = await params;
  if (slug !== "ironclad" && slug !== "sirion") {
    return NextResponse.json({ error: "Unknown vendor" }, { status: 400 });
  }

  const records = await getExportRecords(slug);
  const vendorName = slug === "ironclad" ? "Ironclad" : "Sirion";
  const buffer = buildVendorWorkbook(records, vendorName);

  return new NextResponse(new Blob([new Uint8Array(buffer)]), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="clm-uat-${slug}-results.xlsx"`,
    },
  });
}
