import { db } from '@/lib/db'
import { getJiraConfig, createJiraIssue } from '@/lib/jira'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url)
    const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '100', 10), 1), 500)
    const offset = Math.max(parseInt(url.searchParams.get('offset') || '0', 10), 0)
    const responderId = url.searchParams.get('responderId')
    const disagreementsOnly = url.searchParams.get('disagreement') === 'true'

    const where: Record<string, unknown> = {}
    if (responderId) where.responderId = responderId
    if (disagreementsOnly) {
      // Find decisions where aiLean is not null and differs from decision
      where.NOT = { aiLean: null }
    }

    const decisions = await db.decision.findMany({
      where,
      include: {
        issue: {
          include: { brief: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    })

    const filtered = disagreementsOnly
      ? decisions.filter(d => d.aiLean && d.decision !== d.aiLean)
      : decisions

    const total = disagreementsOnly ? filtered.length : await db.decision.count({ where })

    return NextResponse.json({
      decisions: filtered.map((d) => ({
        id: d.id,
        issueId: d.issueId,
        issueTitle: d.issue?.title ?? '',
        sentryId: d.issue?.sentryIssueId ?? '',
        aiLean: d.aiLean,
        humanDecision: d.decision,
        responder: d.responderId,
        timestamp: d.createdAt.toISOString(),
        disagreement: d.aiLean ? d.decision !== d.aiLean : false,
        jiraKey: d.jiraKey ?? null,
        jiraSummary: d.jiraSummary ?? null,
        suppressReason: d.suppressReason ?? null,
        suppressScope: d.suppressScope ?? null,
      })),
      total,
    })
  } catch (error) {
    console.error('Decisions fetch error:', error)
    return NextResponse.json({ error: 'Failed to fetch decisions', details: String(error) }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { issueId, decision, responderId, metadata } = body

    if (!issueId || !decision) {
      return NextResponse.json({ error: 'issueId and decision are required' }, { status: 400 })
    }

    const metaFields = metadata ? {
      jiraSummary: metadata.summary ?? null,
      jiraDescription: metadata.description ?? null,
      jiraPriority: metadata.priority ?? null,
      jiraComponent: metadata.component ?? null,
      suppressReason: metadata.suppressReason ?? null,
      suppressScope: metadata.suppressScope ?? null,
    } : {}

    if (decision === 'undo') {
      const latestDecision = await db.decision.findFirst({
        where: { issueId },
        orderBy: { createdAt: 'desc' },
      })

      if (!latestDecision) {
        return NextResponse.json({ error: 'No decision to undo' }, { status: 404 })
      }

      if (responderId && latestDecision.responderId !== responderId) {
        return NextResponse.json(
          { error: "Cannot undo another responder's decision" },
          { status: 403 }
        )
      }

      const deleted = await db.decision.delete({
        where: { id: latestDecision.id },
      })

      return NextResponse.json({ decision: deleted, undone: true })
    }

    // Verify the issue exists
    const issue = await db.issue.findUnique({
      where: { id: issueId },
    })

    if (!issue) {
      return NextResponse.json({ error: 'Issue not found' }, { status: 404 })
    }

    // Get the brief for this issue if exists
    const brief = await db.brief.findUnique({
      where: { issueId },
    })

    let jiraKey: string | null = null
    let jiraError: string | null = null

    if (decision === 'jira') {
      const jiraConfig = await getJiraConfig()
      if (jiraConfig) {
        try {
          const result = await createJiraIssue({
            summary: metadata?.summary ?? issue.title,
            description: metadata?.description ?? undefined,
            priority: metadata?.priority ?? undefined,
            component: metadata?.component ?? undefined,
          }, jiraConfig)
          jiraKey = result.key
        } catch (err) {
          jiraError = err instanceof Error ? err.message : String(err)
        }
      }
    }

    const createdDecision = await db.decision.create({
      data: {
        issueId,
        briefId: brief?.id ?? null,
        decision,
        aiLean: brief?.lean ?? null,
        responderId: responderId ?? 'responder-1',
        jiraId: null,
        jiraKey,
        jiraError,
        ...metaFields,
      },
    })

    return NextResponse.json({ decision: createdDecision, jiraKey })
  } catch (error) {
    console.error('Decision creation error:', error)
    return NextResponse.json({ error: 'Failed to create decision', details: String(error) }, { status: 500 })
  }
}
