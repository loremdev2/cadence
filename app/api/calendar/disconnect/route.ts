import { NextResponse, type NextRequest } from "next/server";
import { isSameOriginRequest } from "@/lib/same-origin";
import { getSession } from "@/lib/session";
import { getAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json(
      { error: "Cross-origin request refused", code: "forbidden" },
      { status: 403, headers: NO_STORE },
    );
  }

  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      { error: "Sign in first.", code: "unauthenticated" },
      { status: 401, headers: NO_STORE },
    );
  }

  const admin = getAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: "Storage is not configured.", code: "not_configured" },
      { status: 503, headers: NO_STORE },
    );
  }

  const { error } = await admin
    .from("calendar_connections")
    .delete()
    .eq("user_id", session.userId);

  if (error) {
    console.error("disconnect failed", error.message);
    return NextResponse.json(
      { error: "Could not disconnect the calendar.", code: "storage_error" },
      { status: 500, headers: NO_STORE },
    );
  }

  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
