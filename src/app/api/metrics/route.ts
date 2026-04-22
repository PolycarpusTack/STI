import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)

    // Count issues with brief but no decision (inbox/queue)
    const queueSize = await db.issue.count({
      where: {
        brief: { isNot: null },
        decisions: { none: {} },
      },
    })

    // Count decisions created today
    const handledToday = await db.decision.count({
      where: {
        createdAt: { gte: todayStart },
      },
    })

    // Total decisions
    const totalDecisions = await db.decision.count()

    // Total briefs
    const briefsGenerated = await db.brief.count()

    // Disagreement rate: decisions where decision != aiLean
    let disagreementRate = 0
    if (totalDecisions > 0) {
      const disagreements = await db.decision.count({
        where: {
          aiLean: { not: null },
          decision: { not: 'watchlist' },
        },
      })
      // Fetch all decisions with aiLean to check for disagreement
      const allWithAiLean = await db.decision.findMany({
        where: { aiLean: { not: null } },
        select: { decision: true, aiLean: true },
      })
      const disagreeCount = allWithAiLean.filter(d => d.decision !== d.aiLean).length
      const relevantCount = allWithAiLean.length
      disagreementRate = relevantCount > 0 ? Math.round((disagreeCount / relevantCount) * 10000) / 100 : 0
    }

    // Most recent issue createdAt
    const latestIssue = await db.issue.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    })

    const lastPullAt = latestIssue?.createdAt ?? null

    return NextResponse.json({
      queueSize,
      handledToday,
      disagreementRate,
      lastPull: lastPullAt?.toISOString() ?? null,
      briefsGenerated,
      totalDecisions,
    })
  } catch (error) {
    console.error('Metrics fetch error:', error)
    return NextResponse.json({ error: 'Failed to fetch metrics', details: String(error) }, { status: 500 })
  }
}
