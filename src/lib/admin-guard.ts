import { NextRequest, NextResponse } from "next/server";

export function checkAdminSecret(req: NextRequest): NextResponse | null {
  const secret = process.env.ADMIN_SECRET?.trim();
  if (!secret) return null; // not configured — open access
  const provided = req.headers.get("x-admin-secret");
  if (provided !== secret) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}
