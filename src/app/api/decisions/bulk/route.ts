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
    if (decision === "jira") {
      return NextResponse.json(
        { error: "jira decisions must be created individually to generate Jira tickets" },
        { status: 400 }
      );
    }
    if (issueIds.length > 200) {
      return NextResponse.json({ error: "issueIds must contain at most 200 items" }, { status: 400 });
    }
    if (!(issueIds as unknown[]).every((id) => typeof id === "string")) {
      return NextResponse.json({ error: "all issueIds must be strings" }, { status: 400 });
    }

    const results = await Promise.all(
      (issueIds as string[]).map(async (issueId) => {
        const issue = await db.issue.findUnique({ where: { id: issueId } });
        if (!issue) return false;
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
        return true;
      })
    );
    const succeeded = results.filter(Boolean).length;
    const failed = results.length - succeeded;

    return NextResponse.json({ succeeded, failed });
  } catch (error) {
    console.error("Bulk decision error:", error);
    return NextResponse.json({ error: "Failed to create decisions", details: String(error) }, { status: 500 });
  }
}
