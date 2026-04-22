import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url)
    const limit = parseInt(url.searchParams.get('limit') || '100')
    const offset = parseInt(url.searchParams.get('offset') || '0')
    const responderId = url.searchParams.get('responderId')
    const disagreementsOnly = url.searchParams.get('disagreements') === 'true'

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

    // Filter disagreements in memory for accuracy
    const filtered = disagreementsOnly
      ? decisions.filter(d => d.aiLean && d.decision !== d.aiLean)
      : decisions

    const total = await db.decision.count({ where })

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
    const { issueId, decision, aiLean, responderId, jiraId } = body

    if (!issueId || !decision) {
      return NextResponse.json({ error: 'issueId and decision are required' }, { status: 400 })
    }

    if (decision === 'undo') {
      // Delete the latest decision for this issue
      const latestDecision = await db.decision.findFirst({
        where: { issueId },
        orderBy: { createdAt: 'desc' },
      })

      if (!latestDecision) {
        return NextResponse.json({ error: 'No decision to undo' }, { status: 404 })
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

    const createdDecision = await db.decision.create({
      data: {
        issueId,
        briefId: brief?.id ?? null,
        decision,
        aiLean: aiLean ?? brief?.lean ?? null,
        responderId: responderId ?? 'responder-1',
        jiraId: jiraId ?? null,
      },
    })

    return NextResponse.json({ decision: createdDecision })
  } catch (error) {
    console.error('Decision creation error:', error)
    return NextResponse.json({ error: 'Failed to create decision', details: String(error) }, { status: 500 })
  }
}
