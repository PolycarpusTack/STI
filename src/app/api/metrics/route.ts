import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { readMeta } from '@/lib/meta'
import { getEffectiveSetting, SETTINGS_KEYS } from '@/lib/settings'

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

    // Disagreement rate: actionable decisions (non-watchlist) where human overrode the AI lean.
    // Single query — pre-filter watchlist and null aiLean in DB, compare columns in memory.
    let disagreementRate = 0
    const actionable = await db.decision.findMany({
      where: {
        AND: [
          { aiLean: { not: null } },
          { aiLean: { not: 'watchlist' } },
          { decision: { not: 'watchlist' } },
        ],
      },
      select: { decision: true, aiLean: true },
      orderBy: { createdAt: 'desc' },
      take: 1000,
    })
    if (actionable.length > 0) {
      const disagreeCount = actionable.filter(d => d.decision !== d.aiLean).length
      disagreementRate = Math.round((disagreeCount / actionable.length) * 10000) / 100
    }

    const { lastPullAt } = readMeta()

    const [sentryToken, sentryOrg, sentryProjectLegacy, llmModel, sentryProjectCount] = await Promise.all([
      getEffectiveSetting(SETTINGS_KEYS.sentryToken, "SENTRY_TOKEN"),
      getEffectiveSetting(SETTINGS_KEYS.sentryOrg, "SENTRY_ORG"),
      getEffectiveSetting(SETTINGS_KEYS.sentryProject, "SENTRY_PROJECT"),
      getEffectiveSetting(SETTINGS_KEYS.llmModel, "LLM_MODEL"),
      db.sentryProject.count(),
    ])

    return NextResponse.json({
      queueSize,
      handledToday,
      disagreementRate,
      lastPull: lastPullAt ?? null,
      briefsGenerated,
      totalDecisions,
      llmModel: llmModel ?? null,
      sentryConfigured: !!(sentryToken && sentryOrg && (sentryProjectCount > 0 || sentryProjectLegacy)),
    })
  } catch (error) {
    console.error('Metrics fetch error:', error)
    return NextResponse.json({ error: 'Failed to fetch metrics', details: String(error) }, { status: 500 })
  }
}
