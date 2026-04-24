import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { fetchSentryOrgProjects } from "@/lib/sentry";
import { getEffectiveSetting, SETTINGS_KEYS } from "@/lib/settings";

export async function POST() {
  try {
    const [token, org] = await Promise.all([
      getEffectiveSetting(SETTINGS_KEYS.sentryToken, "SENTRY_TOKEN"),
      getEffectiveSetting(SETTINGS_KEYS.sentryOrg, "SENTRY_ORG"),
    ]);

    if (!token || !org) {
      return NextResponse.json(
        { error: "Sentry token and org must be configured before auto-detecting projects." },
        { status: 400 }
      );
    }

    const orgProjects = await fetchSentryOrgProjects(token, org);

    const existing = await db.sentryProject.findMany({ select: { slug: true } });
    const existingSlugs = new Set(existing.map((p) => p.slug));
    const newProjects = orgProjects.filter((p) => !existingSlugs.has(p.slug));

    if (newProjects.length > 0) {
      await db.sentryProject.createMany({
        data: newProjects.map((p) => ({ slug: p.slug, label: p.name })),
      });
    }

    return NextResponse.json({ added: newProjects.length, total: orgProjects.length });
  } catch (error) {
    console.error("Sentry project discovery error:", error);
    return NextResponse.json(
      { error: "Failed to discover projects", details: String(error) },
      { status: 500 }
    );
  }
}
