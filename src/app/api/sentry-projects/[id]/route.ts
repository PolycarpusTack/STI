import { db } from "@/lib/db";
import { checkAdminSecret } from "@/lib/admin-guard";
import { NextRequest, NextResponse } from "next/server";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = checkAdminSecret(req);
  if (denied) return denied;
  const { id } = await params;
  try {
    const project = await db.sentryProject.findUnique({ where: { id } });
    if (!project) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    await db.sentryProject.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("SentryProject delete error:", error);
    return NextResponse.json({ error: "Failed to delete project", details: String(error) }, { status: 500 });
  }
}
