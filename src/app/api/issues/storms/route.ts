import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

interface StormRow {
  fingerprint: string;
  count: bigint;
  sampleTitle: string;
  sampleIssueId: string;
  projectList: string;
}

export async function GET(request: NextRequest) {
  try {
    const raw = parseInt(new URL(request.url).searchParams.get("threshold") ?? "3", 10);
    const threshold = Math.max(2, isNaN(raw) ? 3 : raw);

    const rows = await db.$queryRaw<StormRow[]>`
      SELECT
        i.fingerprint,
        COUNT(*) AS count,
        MIN(i.title) AS sampleTitle,
        MIN(i.id) AS sampleIssueId,
        GROUP_CONCAT(DISTINCT i.projectId) AS projectList
      FROM "Issue" i
      INNER JOIN "Brief" b ON b."issueId" = i.id
      WHERE NOT EXISTS (
        SELECT 1 FROM "Decision" d WHERE d."issueId" = i.id
      )
      AND i.fingerprint NOT IN (
        SELECT fingerprint FROM "Suppression" WHERE scope = 'global'
      )
      GROUP BY i.fingerprint
      HAVING COUNT(*) >= ${threshold}
      ORDER BY COUNT(*) DESC
      LIMIT 10
    `;

    const storms = rows.map((r) => ({
      fingerprint: r.fingerprint,
      count: Number(r.count),
      sampleTitle: r.sampleTitle,
      sampleIssueId: r.sampleIssueId,
      projects: r.projectList ? r.projectList.split(",") : [],
    }));

    return NextResponse.json({ storms, truncated: rows.length === 10 });
  } catch (error) {
    console.error("Storms fetch error:", error);
    return NextResponse.json({ error: "Failed to detect storms", details: String(error) }, { status: 500 });
  }
}
