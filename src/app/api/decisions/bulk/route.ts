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

    // Batch-fetch all issues and briefs in two queries instead of 2×N
    const [issues, briefs] = await Promise.all([
      db.issue.findMany({
        where: { id: { in: issueIds as string[] } },
        select: { id: true },
      }),
      db.brief.findMany({
        where: { issueId: { in: issueIds as string[] } },
        select: { id: true, issueId: true, lean: true },
      }),
    ]);

    const issueSet = new Set(issues.map((i) => i.id));
    const briefMap = new Map(briefs.map((b) => [b.issueId, b]));

    const validIds = (issueIds as string[]).filter((id) => issueSet.has(id));

    if (validIds.length > 0) {
      await db.decision.createMany({
        data: validIds.map((issueId) => {
          const brief = briefMap.get(issueId) ?? null;
          return {
            issueId,
            briefId: brief?.id ?? null,
            decision,
            aiLean: brief?.lean ?? null,
            responderId,
          };
        }),
      });
    }

    const succeeded = validIds.length;
    const failed = (issueIds as string[]).length - succeeded;

    return NextResponse.json({ succeeded, failed });
  } catch (error) {
    console.error("Bulk decision error:", error);
    return NextResponse.json({ error: "Failed to create decisions", details: String(error) }, { status: 500 });
  }
}
