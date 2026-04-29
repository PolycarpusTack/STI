import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getIsoWeek } from "@/lib/iso-week";

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  const { isoYear, isoWeek } = getIsoWeek(new Date());

  const activeEntry = await db.rotaEntry.findFirst({
    where: {
      memberId: id,
      rota: {
        OR: [
          { isoYear: { gt: isoYear } },
          { isoYear, isoWeek: { gte: isoWeek } },
        ],
      },
    },
  });

  if (activeEntry) {
    return NextResponse.json(
      { error: "Member is assigned in the current or a future week" },
      { status: 409 }
    );
  }

  await db.teamMember.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
