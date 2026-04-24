import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import AiClient from "z-ai-web-dev-sdk";
import { getEffectiveSetting, SETTINGS_KEYS } from "@/lib/settings";
import { VALID_LEANS, type Lean } from "@/lib/constants";

// ─── Sentinel System Prompt ───────────────────────────────────────────────────

const SENTINEL_SYSTEM_PROMPT = `You are Sentinel, a Senior Incident Triage Analyst. Your job is to analyze Sentry issues and produce clear, actionable, prioritized triage outputs for a human support or engineering team. You do not summarize. You make decisions.

─── PRIMARY GOALS ───
1. Explain the issue in plain English. No raw stack trace language.
2. Determine business impact: what is broken for users.
3. Assign exactly one priority: P0, P1, P2, P3, or Noise.
4. Classify the issue type: Bug, Regression, Integration, User Error, External, or Infrastructure.
5. Identify affected clients or scope if metadata is available.
6. Decide whether this should result in a ticket.

─── PRIORITY DEFINITIONS ───
P0 Critical – system unusable, core flow blocked, or direct revenue impact.
P1 High – major functionality broken, no workaround.
P2 Medium – partial degradation, workaround exists.
P3 Low – minor issue, cosmetic, edge case.
Noise – no action needed.

─── NOISE RULES ───
Classify as Noise if:
- Single or very low occurrence with no repeat pattern
- Known non-actionable (browser extensions, bots, ad SDKs, crawlers)
- Already-tracked issue with no meaningful change
- Handled exception with no user-facing impact
- Environment artifact (staging pollution, test runner side effect)
Be confident when labeling Noise. "Noise – no action recommended."

─── RECOMMENDATION RULES ───
Every output must recommend exactly ONE of:
- Create ticket (P0–P3 with user-facing impact or meaningful frequency)
- Ignore (Noise or no qualifying condition met)
Do not hedge. Make a call. If no known-issues context is provided, do not speculate about duplicates.

─── ACTION BIAS RULE ───
Default to Ignore unless there is clear user-facing impact OR meaningful frequency.
Do not create tickets as a precaution or "just in case."
A ticket requires at least one of:
- Confirmed user-facing impact
- Meaningful frequency relative to application traffic
- Clear regression signal (spike correlated with deployment)
If none are met, the correct action is Ignore.

─── TYPE-PRIORITY INTERACTION ───
- Regression + recent release → elevate priority by one level
- External dependency → cap at P2 unless impact is widespread and sustained
- User error / misuse → default to Noise or P3 unless frequency indicates UX problem
- Infrastructure → severity depends on scope (one endpoint = P2, whole service = P0)

─── ANTI-AGGREGATION RULE ───
Analyze one issue at a time. Only use signals present in the input. Do not infer cross-issue patterns, systemic trends, or correlations unless that context is explicitly provided. Do not synthesize narratives from absence of data.

─── UNCERTAINTY RULES ───
State your best assessment with conviction. If the underlying data is incomplete or ambiguous, flag that uncertainty in confidenceNotes. Never weaken your recommendation to express uncertainty — separate the two.

─── STYLE RULES ───
- No filler, no throat-clearing, no fluff.
- Translate technical errors into user impact.
- Prefer clarity over completeness.
- If data is missing, say so explicitly. Do not fabricate or assume.

─── LEAN FIELD MAPPING (STA routing) ───
Map your Sentinel decision to the STA lean field:
- "jira": Priority P0–P3 + Create ticket recommendation
- "close": Priority Noise + Ignore recommendation
- "investigate": Ambiguous or insufficient data to classify confidently
- "watchlist": Actionable but low urgency (P3), worth monitoring before acting

─── OUTPUT FORMAT (STRICT JSON — respond ONLY with valid JSON) ───
{
  "lean": "jira" | "close" | "investigate" | "watchlist",
  "confidence": 0.0-1.0,
  "priority": "P0" | "P1" | "P2" | "P3" | "Noise",
  "issueType": "Bug" | "Regression" | "Integration" | "User Error" | "External" | "Infrastructure",
  "summary": "1-2 sentence impact summary: what is broken, who is affected",
  "module": "affected module or component name",
  "tenantImpact": "scope: all users, subset, specific tenant, or not determinable",
  "reproductionHint": "root cause hypothesis in plain terms, or null",
  "confidenceNotes": "data gaps or low-confidence elements, or null if high-confidence",
  "signals": "release correlation, spike detection, historical pattern, or null"
}`;

// ─── Few-Shot Examples ────────────────────────────────────────────────────────

const FEW_SHOT: Array<{ role: "user" | "assistant"; content: string }> = [
  // P0 Critical Regression
  {
    role: "user",
    content: JSON.stringify({
      title: "TypeError: Cannot read property 'id' of undefined",
      culprit: "/checkout",
      eventCount: 3200,
      release: "v5.2.1",
      environment: "production",
      firstSeen: "2026-04-23T10:00:00Z",
      lastSeen: "2026-04-23T10:30:00Z",
      stacktrace: null,
      tags: "{}",
    }),
  },
  {
    role: "assistant",
    content: JSON.stringify({
      lean: "jira",
      confidence: 0.97,
      priority: "P0",
      issueType: "Regression",
      summary: "Checkout fails due to missing data in the payment step. Users cannot complete purchases — core revenue flow is blocked.",
      module: "checkout",
      tenantImpact: "All production users",
      reproductionHint: "Frontend is not sending the required payment method ID after the v5.2.1 deployment.",
      confidenceNotes: null,
      signals: "Spike started immediately after release v5.2.1.",
    }),
  },
  // Clear Noise
  {
    role: "user",
    content: JSON.stringify({
      title: "ResizeObserver loop limit exceeded",
      culprit: "unknown",
      eventCount: 12,
      release: null,
      environment: "production",
      firstSeen: "2026-04-23T08:00:00Z",
      lastSeen: "2026-04-23T20:00:00Z",
      stacktrace: null,
      tags: '{"browser":"Chrome"}',
    }),
  },
  {
    role: "assistant",
    content: JSON.stringify({
      lean: "close",
      confidence: 0.93,
      priority: "Noise",
      issueType: "External",
      summary: "Minor browser rendering warning triggered by layout recalculations. No visible impact to users.",
      module: "browser/rendering",
      tenantImpact: "Not determinable from event data",
      reproductionHint: "Chrome's ResizeObserver fires this warning during rapid layout changes, often amplified by browser extensions.",
      confidenceNotes: null,
      signals: null,
    }),
  },
  // P2 with workaround
  {
    role: "user",
    content: JSON.stringify({
      title: "API timeout on /reports/export",
      culprit: "/reports/export",
      eventCount: 150,
      release: null,
      environment: "production",
      firstSeen: "2026-04-20T00:00:00Z",
      lastSeen: "2026-04-23T23:59:00Z",
      stacktrace: "TimeoutException: query exceeded 30s\n  at db.query:234\n  at ReportExporter.run:89",
      tags: '{}',
    }),
  },
  {
    role: "assistant",
    content: JSON.stringify({
      lean: "jira",
      confidence: 0.84,
      priority: "P2",
      issueType: "Bug",
      summary: "Report exports fail for large datasets due to API timeouts. Users with smaller datasets are unaffected.",
      module: "reports/export",
      tenantImpact: "Subset with large datasets — likely enterprise tier",
      reproductionHint: "Backend query or serialization exceeds the API timeout threshold for large result sets.",
      confidenceNotes: null,
      signals: null,
    }),
  },
  // Degraded input — incomplete data
  {
    role: "user",
    content: JSON.stringify({
      title: "NullPointerException",
      culprit: "unknown",
      eventCount: 45,
      release: null,
      environment: null,
      firstSeen: "2026-04-23T12:00:00Z",
      lastSeen: "2026-04-23T14:00:00Z",
      stacktrace: "at framework.core.AbstractHandler:42\nat framework.core.DispatcherServlet:186\nat framework.core.Filter:98",
      tags: "{}",
    }),
  },
  {
    role: "assistant",
    content: JSON.stringify({
      lean: "investigate",
      confidence: 0.52,
      priority: "P2",
      issueType: "Bug",
      summary: "Null reference error at moderate frequency. Affected feature cannot be determined from available data.",
      module: "unknown — framework internals only",
      tenantImpact: "Not determinable from event data",
      reproductionHint: "Null reference in application code. Cannot isolate further — stack trace shows only framework internals.",
      confidenceNotes: "Missing: breadcrumbs, release tag, tenant metadata, and application-level stack frames. Root cause hypothesis is low-confidence.",
      signals: null,
    }),
  },
  // P3 Watchlist — low urgency, real issue
  {
    role: "user",
    content: JSON.stringify({
      title: "DeprecationWarning: Legacy auth endpoint called",
      culprit: "/api/v1/auth/login",
      eventCount: 8,
      release: null,
      environment: "production",
      firstSeen: "2026-04-01T00:00:00Z",
      lastSeen: "2026-04-23T18:00:00Z",
      stacktrace: null,
      tags: '{"route":"/api/v1/auth/login"}',
    }),
  },
  {
    role: "assistant",
    content: JSON.stringify({
      lean: "watchlist",
      confidence: 0.75,
      priority: "P3",
      issueType: "Bug",
      summary: "Legacy auth endpoint is still being called despite deprecation. Low frequency suggests a small number of outdated clients.",
      module: "auth/v1",
      tenantImpact: "Small subset of users on outdated clients",
      reproductionHint: "Some clients are not using the v2 auth endpoint. Likely a mobile app or integration not yet updated.",
      confidenceNotes: null,
      signals: null,
    }),
  },
];

// ─── Parsing ──────────────────────────────────────────────────────────────────

type Priority = "P0" | "P1" | "P2" | "P3" | "Noise";
type IssueType = "Bug" | "Regression" | "Integration" | "User Error" | "External" | "Infrastructure";

export interface SentinelOutput {
  lean: Lean;
  confidence: number;
  priority: Priority | "";
  issueType: IssueType | "";
  summary: string;
  module: string;
  tenantImpact: string;
  reproductionHint: string | null;
  confidenceNotes: string | null;
  signals: string | null;
}

const VALID_PRIORITIES: Priority[] = ["P0", "P1", "P2", "P3", "Noise"];
const VALID_TYPES: IssueType[] = ["Bug", "Regression", "Integration", "User Error", "External", "Infrastructure"];

export function parseSentinelResponse(raw: string): SentinelOutput | null {
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const m = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (m) {
      try { parsed = JSON.parse(m[1].trim()); } catch { return null; }
    } else {
      return null;
    }
  }

  if (!parsed || typeof parsed !== "object") return null;
  const p = parsed as Record<string, unknown>;

  if (typeof p.lean !== "string" || typeof p.confidence !== "number" || typeof p.summary !== "string") {
    return null;
  }

  return {
    lean: (VALID_LEANS as readonly string[]).includes(p.lean) ? (p.lean as Lean) : "investigate",
    confidence: Math.min(Math.max(p.confidence as number, 0), 1),
    priority: VALID_PRIORITIES.includes(p.priority as Priority) ? (p.priority as Priority) : "",
    issueType: VALID_TYPES.includes(p.issueType as IssueType) ? (p.issueType as IssueType) : "",
    summary: p.summary as string,
    module: typeof p.module === "string" ? p.module : "",
    tenantImpact: typeof p.tenantImpact === "string" ? p.tenantImpact : "",
    reproductionHint: typeof p.reproductionHint === "string" ? p.reproductionHint : null,
    confidenceNotes: typeof p.confidenceNotes === "string" ? p.confidenceNotes : null,
    signals: typeof p.signals === "string" ? p.signals : null,
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export async function generateBrief(issueId: string) {
  const issue = await db.issue.findUnique({ where: { id: issueId } });
  if (!issue) throw new Error(`Issue ${issueId} not found`);

  const existing = await db.brief.findUnique({ where: { issueId }, select: { id: true } });
  if (existing) return existing;

  const issueData = {
    title: issue.title,
    culprit: issue.culprit,
    level: issue.level,
    status: issue.status,
    environment: issue.environment,
    release: issue.release,
    eventCount: issue.eventCount,
    firstSeen: issue.firstSeen.toISOString(),
    lastSeen: issue.lastSeen.toISOString(),
    stacktrace: issue.stacktrace,
    tags: issue.tags,
    projectId: issue.projectId,
  };

  const [llmBaseUrl, llmApiKey, llmModel] = await Promise.all([
    getEffectiveSetting(SETTINGS_KEYS.llmBaseUrl, "LLM_BASE_URL"),
    getEffectiveSetting(SETTINGS_KEYS.llmApiKey, "LLM_API_KEY"),
    getEffectiveSetting(SETTINGS_KEYS.llmModel, "LLM_MODEL"),
  ]);
  const model = llmModel ?? "gpt-4o";

  const messages = [
    { role: "system" as const, content: SENTINEL_SYSTEM_PROMPT },
    ...FEW_SHOT,
    { role: "user" as const, content: JSON.stringify(issueData) },
  ];

  const startTime = Date.now();
  let completion: { choices: Array<{ message: { content: string } }>; usage?: { total_tokens?: number } };

  if (llmBaseUrl && llmApiKey) {
    const res = await fetch(`${llmBaseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${llmApiKey}` },
      body: JSON.stringify({ model, messages }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) throw new Error(`LLM API error ${res.status}: ${await res.text()}`);
    completion = await res.json();
  } else {
    const client = await AiClient.create();
    completion = await client.chat.completions.create({ model, messages });
  }

  const latencyMs = Date.now() - startTime;
  const rawResponse = completion.choices[0]?.message?.content ?? "";
  const tokenCount = completion.usage?.total_tokens ?? null;

  const parsed = parseSentinelResponse(rawResponse);

  try {
    return await db.brief.create({
      data: {
        issueId,
        promptVersion: "v1.0.0-sentinel",
        lean: parsed ? parsed.lean : "investigate",
        confidence: parsed ? parsed.confidence : 0,
        priority: parsed ? parsed.priority : "",
        issueType: parsed ? parsed.issueType : "",
        summary: parsed ? parsed.summary : "Failed to parse Sentinel response. Raw response stored.",
        module: parsed ? parsed.module : "",
        tenantImpact: parsed ? parsed.tenantImpact : "",
        reproductionHint: parsed ? parsed.reproductionHint : null,
        confidenceNotes: parsed ? parsed.confidenceNotes : null,
        signals: parsed ? parsed.signals : null,
        rawResponse,
        parseError: !parsed,
        tokenCount,
        latencyMs,
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      // A concurrent caller already created the brief — return what they wrote.
      return await db.brief.findUniqueOrThrow({ where: { issueId } });
    }
    throw err;
  }
}
