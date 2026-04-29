import { NextResponse } from "next/server";
import { db } from "@/lib/db";

const DEFAULT_ROLES = [
  { name: "Support Developer", sortOrder: 1 },
  { name: "Support Engineer", sortOrder: 2 },
];

export async function GET() {
  let roles = await db.teamRole.findMany({ orderBy: { sortOrder: "asc" } });
  if (roles.length === 0) {
    await db.teamRole.createMany({ data: DEFAULT_ROLES });
    roles = await db.teamRole.findMany({ orderBy: { sortOrder: "asc" } });
  }
  return NextResponse.json(roles);
}

export async function POST(req: Request) {
  const body = await req.json();
  const { name, sortOrder } = body;
  if (!name || typeof name !== "string") {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }
  const role = await db.teamRole.create({
    data: { name: name.trim(), sortOrder: sortOrder ?? 0 },
  });
  return NextResponse.json(role, { status: 201 });
}
