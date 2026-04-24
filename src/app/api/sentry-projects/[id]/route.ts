import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const project = await db.sentryProject.findUnique({ where: { id } });
  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  await db.sentryProject.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
