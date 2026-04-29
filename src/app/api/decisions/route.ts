import { db } from '@/lib/db'
import { getJiraConfig, createJiraIssue } from '@/lib/jira'
import { VALID_LEANS } from '@/lib/constants'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url)
    const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '100', 10), 1), 500)
    const offset = Math.max(parseInt(url.searchParams.get('offset') || '0', 10), 0)
    const disagreementsOnly = url.searchParams.get('disagreement') === 'true'
    const sinceParam = url.searchParams.get('since')
    const sinceDate = sinceParam ? new Date(Number(sinceParam)) : null

    const where: Record<string, unknown> = sinceDate && !isNaN(sinceDate.getTime())
      ? { createdAt: { gte: sinceDate } }
      : {}

    let filtered: Awaited<ReturnType<typeof db.decision.findMany<{ include: { issue: { include: { brief: true } } } }>>>
    let total: number

    if (disagreementsOnly) {
      // Prisma can't express column-to-column inequality; fetch all aiLean!=null rows and paginate in memory
      const all = await db.decision.findMany({
        where: { ...where, aiLean: { not: null } },
        include: { issue: { include: { brief: true } } },
        orderBy: { createdAt: 'desc' },
      })
      const disagreements = all.filter(d => d.aiLean && d.decision !== d.aiLean)
      total = disagreements.length
      filtered = disagreements.slice(offset, offset + limit)
    } else {
      filtered = await db.decision.findMany({
        where,
        include: { issue: { include: { brief: true } } },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      })
      total = await db.decision.count({ where })
    }

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

    if (decision !== 'undo' && !VALID_LEANS.includes(decision)) {
      return NextResponse.json({ error: `Invalid decision '${decision}'. Must be one of: ${VALID_LEANS.join(', ')}` }, { status: 400 })
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
      if (!responderId) {
        return NextResponse.json({ error: 'responderId is required to undo a decision' }, { status: 400 })
      }
      const latestDecision = await db.decision.findFirst({
        where: { issueId },
        orderBy: { createdAt: 'desc' },
      })
      if (!latestDecision) {
        return NextResponse.json({ error: 'No decision to undo' }, { status: 404 })
      }
      if (latestDecision.responderId !== responderId) {
        return NextResponse.json({ error: "Cannot undo another responder's decision" }, { status: 403 })
      }
      await db.decision.delete({ where: { id: latestDecision.id } })
      return NextResponse.json({ ok: true })
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

    if (decision === 'jira') {
      const jiraConfig = await getJiraConfig()
      if (!jiraConfig) {
        return NextResponse.json({ jiraError: 'Jira is not configured. Set JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_KEY, and JIRA_PROJECT_KEY in Settings.' }, { status: 200 })
      }
      try {
        const result = await createJiraIssue({
          summary: metadata?.summary ?? issue.title,
          description: metadata?.description ?? undefined,
          priority: metadata?.priority ?? undefined,
          component: metadata?.component ?? undefined,
        }, jiraConfig)
        jiraKey = result.key
      } catch (err) {
        // Jira failed — surface the error without recording a decision so
        // the issue stays in the inbox and the user can retry or cancel.
        const msg = err instanceof Error ? err.message : String(err)
        return NextResponse.json({ jiraError: msg }, { status: 200 })
      }
    }

    const createdDecision = await db.decision.create({
      data: {
        issueId,
        briefId: brief?.id ?? null,
        decision,
        aiLean: brief?.lean ?? null,
        responderId: responderId ?? 'responder-1',
        jiraKey,
        ...metaFields,
      },
    })

    return NextResponse.json({ decision: createdDecision, jiraKey })
  } catch (error) {
    console.error('Decision creation error:', error)
    return NextResponse.json({ error: 'Failed to create decision', details: String(error) }, { status: 500 })
  }
}
