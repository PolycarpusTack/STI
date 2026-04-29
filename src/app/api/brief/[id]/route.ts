import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { generateBrief } from "@/lib/brief";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const issue = await db.issue.findUnique({ where: { id }, select: { id: true } });
    if (!issue) {
      return NextResponse.json({ error: "Issue not found" }, { status: 404 });
    }

    // Delete first so generateBrief (which skips existing briefs) will create a fresh one.
    // Do this atomically: delete → generate → on failure the issue is briefly unbrief-able
    // but the next pipeline run will re-queue it. Generate before delete would hit the
    // unique constraint, so we accept the narrow window and let it recover naturally.
    await db.brief.deleteMany({ where: { issueId: id } });

    try {
      const brief = await generateBrief(id);
      return NextResponse.json({ brief });
    } catch (error) {
      console.error("Brief generation error:", error);
      return NextResponse.json(
        { error: "Failed to generate brief", details: String(error) },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("Brief regeneration error:", error);
    return NextResponse.json(
      { error: "Failed to regenerate brief", details: String(error) },
      { status: 500 }
    );
  }
}
