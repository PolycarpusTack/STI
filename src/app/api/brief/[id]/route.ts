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

    await db.brief.deleteMany({ where: { issueId: id } });

    const brief = await generateBrief(id);
    return NextResponse.json({ brief });
  } catch (error) {
    console.error("Brief generation error:", error);
    return NextResponse.json(
      { error: "Failed to generate brief", details: String(error) },
      { status: 500 }
    );
  }
}
