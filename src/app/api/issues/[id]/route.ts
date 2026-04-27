import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const issue = await db.issue.findUnique({
      where: { id },
      include: {
        brief: true,
        decisions: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    })

    if (!issue) {
      return NextResponse.json({ error: 'Issue not found' }, { status: 404 })
    }

    // Transform to match frontend Issue interface
    const latestDecision = issue.decisions[0] ?? null

    const formatted = {
      id: issue.id,
      sentryId: issue.sentryIssueId,
      title: issue.title,
      level: issue.level,
      project: issue.projectId,
      environment: issue.environment,
      release: issue.release,
      eventCount: issue.eventCount,
      firstSeen: issue.firstSeen.toISOString(),
      lastSeen: issue.lastSeen.toISOString(),
      fingerprint: issue.fingerprint,
      culprit: issue.culprit,
      stacktrace: issue.stacktrace,
      lean: issue.brief?.lean ?? null,
      confidence: issue.brief?.confidence ?? null,
      brief: issue.brief ? {
        id: issue.brief.id,
        summary: issue.brief.summary,
        module: issue.brief.module,
        tenantImpact: issue.brief.tenantImpact,
        reproductionHint: issue.brief.reproductionHint,
        priority: issue.brief.priority ?? null,
        issueType: issue.brief.issueType ?? null,
        confidenceNotes: issue.brief.confidenceNotes ?? null,
        signals: issue.brief.signals ?? null,
        promptVersion: issue.brief.promptVersion,
        parseError: issue.brief.parseError ? 'Failed to parse LLM response' : null,
        rawResponse: issue.brief.parseError ? (issue.brief.rawResponse || null) : null,
        tokenCount: issue.brief.tokenCount,
        latencyMs: issue.brief.latencyMs,
      } : null,
      decision: latestDecision ? {
        decision: latestDecision.decision,
        responder: latestDecision.responderId,
        timestamp: latestDecision.createdAt.toISOString(),
        aiLean: latestDecision.aiLean,
        jiraKey: latestDecision.jiraKey ?? null,
      } : null,
    }

    return NextResponse.json(formatted)
  } catch (error) {
    console.error('Issue fetch error:', error)
    return NextResponse.json({ error: 'Failed to fetch issue', details: String(error) }, { status: 500 })
  }
}
