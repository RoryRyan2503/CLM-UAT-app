import { NextResponse, type NextRequest } from "next/server";
import { updateSupabaseSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/admin")) {
    return updateSupabaseSession(request);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};
