import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  const projects = await db.sentryProject.findMany({
    select: { id: true, slug: true, label: true },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(projects);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const slug = typeof body.slug === "string" ? body.slug.trim() : "";
  if (!slug) {
    return NextResponse.json({ error: "slug is required" }, { status: 400 });
  }
  const label = typeof body.label === "string" ? body.label.trim() : "";
  try {
    const project = await db.sentryProject.create({ data: { slug, label } });
    return NextResponse.json(project, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Project already exists" }, { status: 409 });
  }
}
