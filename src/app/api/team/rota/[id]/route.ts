import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  await db.weeklyRota.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
