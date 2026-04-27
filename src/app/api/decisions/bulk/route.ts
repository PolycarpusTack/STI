import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { VALID_LEANS } from "@/lib/constants";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { issueIds, decision, responderId = "responder-1" } = body;

    if (!Array.isArray(issueIds) || issueIds.length === 0) {
      return NextResponse.json({ error: "issueIds must be a non-empty array" }, { status: 400 });
    }
    if (!VALID_LEANS.includes(decision)) {
      return NextResponse.json(
        { error: `decision must be one of: ${VALID_LEANS.join(", ")}` },
        { status: 400 }
      );
    }

    let succeeded = 0;
    let failed = 0;

    await Promise.all(
      (issueIds as string[]).map(async (issueId) => {
        const issue = await db.issue.findUnique({ where: { id: issueId } });
        if (!issue) { failed++; return; }
        const brief = await db.brief.findUnique({ where: { issueId } });
        await db.decision.create({
          data: {
            issueId,
            briefId: brief?.id ?? null,
            decision,
            aiLean: brief?.lean ?? null,
            responderId,
          },
        });
        succeeded++;
      })
    );

    return NextResponse.json({ succeeded, failed });
  } catch (error) {
    console.error("Bulk decision error:", error);
    return NextResponse.json({ error: "Failed to create decisions", details: String(error) }, { status: 500 });
  }
}
