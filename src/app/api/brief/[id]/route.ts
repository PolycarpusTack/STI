import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import ZAI from 'z-ai-web-dev-sdk'

const STA_SYSTEM_PROMPT = `You are the Sentry Triage Assistant (STA). You analyse Sentry error reports from the WHATS'ON SaaS platform and produce a structured triage brief.

OUTPUT FORMAT: Respond ONLY with valid JSON matching this schema:
{
  "lean": "jira" | "close" | "investigate" | "watchlist",
  "confidence": 0.0-1.0,
  "summary": "2-3 sentence plain-English summary of the issue",
  "module": "affected module or component name",
  "tenantImpact": "which tenants are affected, if discernible",
  "reproductionHint": "how to reproduce, if discernible, otherwise null"
}

LEAN DEFINITIONS:
- "jira": The issue needs a Jira ticket. It affects production users, indicates a bug or regression, or requires engineering action. High confidence it's a real problem.
- "close": The issue is noise. It's a known pattern (bot traffic, browser extension, scanning), a third-party dependency outside our control, or already resolved.
- "investigate": The issue is suspicious but ambiguous. It needs a human to look at the context (tenant, release, frequency) before deciding.
- "watchlist": The issue is real but low-priority. It's recurring, has been seen before, or affects a non-critical path. Monitor but don't act now.

RULES:
- Start with the lean most supported by evidence. Confidence should reflect uncertainty.
- If the stacktrace contains [REDACTED] markers, note them but don't lower confidence for that reason alone.
- Consider event count and frequency: a single occurrence of a severe error may still warrant "jira".
- Don't mention specific tenant names or PII in the summary.
- Default to "investigate" if genuinely uncertain between two options.`

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // Look up the issue
    const issue = await db.issue.findUnique({
      where: { id },
    })

    if (!issue) {
      return NextResponse.json({ error: 'Issue not found' }, { status: 404 })
    }

    // Check if a brief already exists
    const existingBrief = await db.brief.findUnique({
      where: { issueId: id },
    })

    if (existingBrief) {
      return NextResponse.json({ brief: existingBrief, message: 'Brief already exists' })
    }

    // Build user message from issue data
    const issueData = {
      title: issue.title,
      level: issue.level,
      status: issue.status,
      environment: issue.environment,
      release: issue.release,
      eventCount: issue.eventCount,
      firstSeen: issue.firstSeen.toISOString(),
      lastSeen: issue.lastSeen.toISOString(),
      culprit: issue.culprit,
      stacktrace: issue.stacktrace,
      tags: issue.tags,
      projectId: issue.projectId,
    }

    const userMessage = `Analyze the following Sentry issue and produce a triage brief:\n\n${JSON.stringify(issueData, null, 2)}`

    // Call LLM via z-ai-web-dev-sdk
    const startTime = Date.now()
    const completion = await ZAI.chat.completions.create({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: STA_SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ],
      thinking: { type: 'disabled' },
    })

    const latencyMs = Date.now() - startTime
    const rawResponse = completion.choices[0]?.message?.content ?? ''
    const tokenCount = completion.usage?.total_tokens ?? null

    // Try to parse the LLM response as JSON
    let parsed: {
      lean: string
      confidence: number
      summary: string
      module: string
      tenantImpact: string
      reproductionHint: string | null
    } | null = null

    try {
      // Try direct parse first
      parsed = JSON.parse(rawResponse)
    } catch {
      // Try to extract JSON from markdown code blocks
      const jsonMatch = rawResponse.match(/```(?:json)?\s*([\s\S]*?)```/)
      if (jsonMatch) {
        try {
          parsed = JSON.parse(jsonMatch[1].trim())
        } catch {
          // Give up
        }
      }
    }

    if (
      parsed &&
      typeof parsed.lean === 'string' &&
      typeof parsed.confidence === 'number' &&
      typeof parsed.summary === 'string'
    ) {
      // Valid brief — create it
      const brief = await db.brief.create({
        data: {
          issueId: id,
          promptVersion: 'v0.4.0',
          lean: parsed.lean,
          confidence: Math.min(Math.max(parsed.confidence, 0), 1),
          summary: parsed.summary,
          module: parsed.module || '',
          tenantImpact: parsed.tenantImpact || '',
          reproductionHint: parsed.reproductionHint ?? null,
          rawResponse,
          parseError: false,
          tokenCount,
          latencyMs,
        },
      })
      return NextResponse.json({ brief })
    } else {
      // Invalid response — create brief with parseError
      const brief = await db.brief.create({
        data: {
          issueId: id,
          promptVersion: 'v0.4.0',
          lean: 'investigate',
          confidence: 0.0,
          summary: `Failed to parse AI response. Raw response stored for review.`,
          module: '',
          tenantImpact: '',
          reproductionHint: null,
          rawResponse,
          parseError: true,
          tokenCount,
          latencyMs,
        },
      })
      return NextResponse.json({ brief, parseError: true, rawResponse }, { status: 200 })
    }
  } catch (error) {
    console.error('Brief generation error:', error)
    return NextResponse.json({ error: 'Failed to generate brief', details: String(error) }, { status: 500 })
  }
}
