import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  const members = await db.teamMember.findMany({
    include: { defaultRole: true },
    orderBy: { name: "asc" },
  });

  const allEntries = await db.rotaEntry.findMany({
    select: { memberId: true, rotaId: true },
  });

  const weeksByMember = new Map<string, Set<string>>();
  for (const e of allEntries) {
    if (!weeksByMember.has(e.memberId)) weeksByMember.set(e.memberId, new Set());
    weeksByMember.get(e.memberId)!.add(e.rotaId);
  }

  return NextResponse.json(
    members.map((m) => ({ ...m, weeksOnDuty: weeksByMember.get(m.id)?.size ?? 0 }))
  );
}

export async function POST(req: Request) {
  const body = await req.json();
  const { name, defaultRoleId } = body;
  if (!name || typeof name !== "string") {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }
  const member = await db.teamMember.create({
    data: { name: name.trim(), defaultRoleId: defaultRoleId ?? null },
    include: { defaultRole: true },
  });
  return NextResponse.json({ ...member, weeksOnDuty: 0 }, { status: 201 });
}
