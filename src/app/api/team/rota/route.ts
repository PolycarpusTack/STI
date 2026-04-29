import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(req: Request) {
  const rotaWeeks = await db.weeklyRota.findMany({
    include: {
      entries: { include: { role: true, member: true } },
    },
    orderBy: [{ isoYear: "asc" }, { isoWeek: "asc" }],
  });
  return NextResponse.json(rotaWeeks);
}

export async function POST(req: Request) {
  const body = await req.json();
  const { isoYear, isoWeek, notes = "", assignments = [] } = body;

  if (!isoYear || !isoWeek) {
    return NextResponse.json({ error: "isoYear and isoWeek required" }, { status: 400 });
  }

  const rota = await db.weeklyRota.upsert({
    where: { isoYear_isoWeek: { isoYear, isoWeek } },
    create: { isoYear, isoWeek, notes },
    update: { notes },
  });

  await db.rotaEntry.deleteMany({ where: { rotaId: rota.id } });

  if (assignments.length > 0) {
    await db.rotaEntry.createMany({
      data: (assignments as Array<{ roleId: string; memberId: string }>).map((a) => ({
        rotaId: rota.id,
        roleId: a.roleId,
        memberId: a.memberId,
      })),
    });
  }

  const result = await db.weeklyRota.findUnique({
    where: { id: rota.id },
    include: { entries: { include: { role: true, member: true } } },
  });

  return NextResponse.json(result);
}
