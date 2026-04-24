import { NextResponse } from "next/server";
import { getSentryConfig } from "@/lib/pipeline";
import { validateSentryToken } from "@/lib/sentry";

export async function POST() {
  const config = await getSentryConfig();

  if (!config) {
    return NextResponse.json(
      { ok: false, error: "Token, org, and at least one project must all be configured." },
      { status: 400 }
    );
  }

  const result = await validateSentryToken({
    token: config.token,
    org: config.org,
    project: config.projects[0],
  });
  return NextResponse.json(result);
}
