import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { isValidLean } from '@/lib/constants'

function formatIssue(issue: {
  id: string
  sentryIssueId: string
  projectId: string
  fingerprint: string
  title: string
  level: string
  status: string
  environment: string
  release: string | null
  eventCount: number
  firstSeen: Date
  lastSeen: Date
  culprit: string
  stacktrace: string | null
  tags: string
  statsJson: string | null
  brief: {
    id: string
    issueId: string
    promptVersion: string
    lean: string
    confidence: number
    summary: string
    module: string
    tenantImpact: string
    reproductionHint: string | null
    priority: string
    issueType: string
    confidenceNotes: string | null
    signals: string | null
    rawResponse: string
    parseError: boolean
    tokenCount: number | null
    latencyMs: number | null
    createdAt: Date
    updatedAt: Date
  } | null
  decisions: {
    id: string
    issueId: string
    briefId: string | null
    decision: string
    aiLean: string | null
    responderId: string
    jiraKey?: string | null
    suppressed: boolean
    createdAt: Date
  }[]
}) {
  const latestDecision = issue.decisions[0] ?? null

  return {
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
    stats: (() => {
      if (!issue.statsJson) return null;
      try {
        const parsed = JSON.parse(issue.statsJson);
        return Array.isArray(parsed) ? parsed as number[] : null;
      } catch {
        return null;
      }
    })(),
    culprit: issue.culprit,
    lean: issue.brief?.lean ?? null,
    confidence: issue.brief?.confidence ?? null,
    brief: issue.brief ? {
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
    } : null,
    decision: latestDecision ? {
      decision: latestDecision.decision,
      responder: latestDecision.responderId,
      timestamp: latestDecision.createdAt.toISOString(),
      jiraKey: latestDecision.jiraKey ?? null,
    } : null,
  }
}

async function countIssues(
  view: string,
  where: Record<string, unknown>,
  lean: string | null,
  globalFps: string[],
  suppressedGlobalFps: string[],
  tenantSuppressions: { fingerprint: string; tenantValue: string | null }[],
  suppressedTenantSupps: { fingerprint: string; tenantValue: string | null }[]
): Promise<number> {
  switch (view) {
    case 'inbox': {
      const briefFilter = lean ? { lean } : { isNot: null };
      const tenantExclusion = (tenantSuppressions && tenantSuppressions.length > 0)
        ? {
            NOT: {
              OR: tenantSuppressions.map(s => ({
                AND: [{ fingerprint: s.fingerprint }, { projectId: s.tenantValue ?? undefined }],
              })),
            },
          }
        : {};
      return db.issue.count({
        where: {
          ...where,
          brief: briefFilter,
          decisions: { none: {} },
          fingerprint: { notIn: globalFps ?? [] },
          ...tenantExclusion,
        },
      });
    }
    case 'watchlist':
      return db.issue.count({
        where: {
          ...where,
          ...(lean ? { brief: { lean } } : {}),
          decisions: {
            some: { decision: 'watchlist' },
            none: { decision: { in: ['jira', 'close', 'investigate'] } },
          },
        },
      });
    case 'suppressed': {
      const suppressedOR = [
        ...(suppressedGlobalFps.length > 0 ? [{ fingerprint: { in: suppressedGlobalFps } }] : []),
        ...suppressedTenantSupps.map(s => ({ fingerprint: s.fingerprint, projectId: s.tenantValue ?? undefined })),
      ]
      return db.issue.count({
        where: {
          ...where,
          ...(suppressedOR.length > 0 ? { OR: suppressedOR } : { id: 'none' }),
          ...(lean ? { brief: { lean } } : {}),
        },
      });
    }
    default:
      return 0;
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const view = (searchParams.get('view') as string) || 'inbox'
    const leanParam = searchParams.get('lean')
    if (leanParam !== null && !isValidLean(leanParam)) {
      return NextResponse.json(
        { error: `Invalid lean value '${leanParam}'. Must be one of: jira, close, investigate, watchlist` },
        { status: 400 }
      )
    }
    const lean = leanParam
    const search = searchParams.get('search')
    const level = searchParams.get('level')
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '50', 10), 1), 200)
    const offset = Math.max(parseInt(searchParams.get('offset') || '0', 10), 0)

    // Build where clause
    const where: Record<string, unknown> = {}

    // Apply search filter
    if (search) {
      where.OR = [
        { title: { contains: search } },
        { culprit: { contains: search } },
      ]
    }

    // Apply level filter
    if (level) {
      where.level = level
    }

    const projectParam = searchParams.get('project')
    const sinceParam = searchParams.get('since')

    if (projectParam) where.projectId = projectParam
    if (sinceParam === '24h') where.lastSeen = { gte: new Date(Date.now() - 86_400_000) }

    let issues
    let inboxGlobalFps: string[] | undefined
    let inboxTenantSuppressions: { fingerprint: string; tenantValue: string | null }[] | undefined
    let suppressedFps: string[] | undefined
    let suppressedGlobalFps: string[] = []
    let suppressedTenantSupps: { fingerprint: string; tenantValue: string | null }[] = []

    switch (view) {
      case 'inbox': {
        const allSuppressions = await db.suppression.findMany({
          select: { fingerprint: true, scope: true, tenantValue: true },
        }) as { fingerprint: string; scope: string; tenantValue: string | null }[]
        const globalFps = allSuppressions.filter(s => s.scope === 'global').map(s => s.fingerprint)
        inboxGlobalFps = globalFps
        const tenantSuppressions = allSuppressions.filter(s => s.scope === 'tenant')
        inboxTenantSuppressions = tenantSuppressions
        const briefFilter = lean ? { lean } : { isNot: null }
        const tenantExclusion = tenantSuppressions.length > 0
          ? {
              NOT: {
                OR: tenantSuppressions.map(s => ({
                  AND: [{ fingerprint: s.fingerprint }, { projectId: s.tenantValue ?? undefined }],
                })),
              },
            }
          : {}
        issues = await db.issue.findMany({
          where: {
            ...where,
            brief: briefFilter,
            decisions: { none: {} },
            fingerprint: { notIn: globalFps },
            ...tenantExclusion,
          },
          include: {
            brief: true,
            decisions: { orderBy: { createdAt: 'desc' }, take: 1 },
          },
          orderBy: { lastSeen: 'desc' },
          take: limit,
          skip: offset,
        })
        break
      }

      case 'watchlist': {
        issues = await db.issue.findMany({
          where: {
            ...where,
            ...(lean ? { brief: { lean } } : {}),
            decisions: {
              some: { decision: 'watchlist' },
              none: { decision: { in: ['jira', 'close', 'investigate'] } },
            },
          },
          include: {
            brief: true,
            decisions: { orderBy: { createdAt: 'desc' }, take: 1 },
          },
          orderBy: { createdAt: 'desc' },
          take: limit,
          skip: offset,
        })
        break
      }

      case 'suppressed': {
        const allSuppressions = await db.suppression.findMany({
          select: { fingerprint: true, scope: true, tenantValue: true },
        })
        const globalSuppFps = allSuppressions.filter(s => s.scope === 'global').map(s => s.fingerprint)
        const tenantSupps = allSuppressions.filter(s => s.scope === 'tenant')
        suppressedGlobalFps = globalSuppFps
        suppressedTenantSupps = tenantSupps
        suppressedFps = [...new Set([...globalSuppFps, ...tenantSupps.map(s => s.fingerprint)])]
        const suppressedOR = [
          ...(globalSuppFps.length > 0 ? [{ fingerprint: { in: globalSuppFps } }] : []),
          ...tenantSupps.map(s => ({ fingerprint: s.fingerprint, projectId: s.tenantValue ?? undefined })),
        ]
        issues = await db.issue.findMany({
          where: {
            ...where,
            ...(suppressedOR.length > 0 ? { OR: suppressedOR } : { id: 'none' }),
            ...(lean ? { brief: { lean } } : {}),
          },
          include: {
            brief: true,
            decisions: { orderBy: { createdAt: 'desc' }, take: 1 },
          },
          orderBy: { lastSeen: 'desc' },
          take: limit,
          skip: offset,
        })
        break
      }

      default:
        return NextResponse.json({ error: `Invalid view: ${view}` }, { status: 400 })
    }

    const total = await countIssues(view, where, lean, inboxGlobalFps ?? [], suppressedGlobalFps, inboxTenantSuppressions ?? [], suppressedTenantSupps)

    return NextResponse.json({
      issues: issues.map(formatIssue),
      total,
      limit,
      offset,
      view,
    })
  } catch (error) {
    console.error('Issues fetch error:', error)
    return NextResponse.json({ error: 'Failed to fetch issues', details: String(error) }, { status: 500 })
  }
}
