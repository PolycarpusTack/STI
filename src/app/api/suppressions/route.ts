import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

export async function GET() {
  try {
    const suppressions = await db.suppression.findMany({
      orderBy: { createdAt: 'desc' },
    })

    const fingerprints = suppressions.map(s => s.fingerprint)
    const issueGroups = fingerprints.length > 0
      ? await db.issue.groupBy({
          by: ['fingerprint', 'projectId'],
          where: { fingerprint: { in: fingerprints } },
          _count: { id: true },
        })
      : []

    const formatted = suppressions.map(s => {
      const matchCount = issueGroups
        .filter(r =>
          r.fingerprint === s.fingerprint &&
          (s.scope === 'global' || r.projectId === s.tenantValue)
        )
        .reduce((sum, r) => sum + r._count.id, 0)
      return {
        id: s.id,
        fingerprint: s.fingerprint,
        reason: s.reason,
        scope: s.scope,
        author: s.authorId,
        createdAt: s.createdAt.toISOString(),
        lastMatched: s.lastMatchedAt?.toISOString() ?? null,
        matchCount,
      }
    })

    return NextResponse.json(formatted)
  } catch (error) {
    console.error('Suppressions fetch error:', error)
    return NextResponse.json({ error: 'Failed to fetch suppressions', details: String(error) }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { fingerprint, reason, scope, tenantValue, authorId } = body

    if (!fingerprint) {
      return NextResponse.json({ error: 'fingerprint is required' }, { status: 400 })
    }

    const effectiveScope = scope ?? 'global'
    if (effectiveScope !== 'global' && effectiveScope !== 'tenant') {
      return NextResponse.json({ error: 'scope must be "global" or "tenant"' }, { status: 400 })
    }
    if (effectiveScope === 'tenant' && !tenantValue) {
      return NextResponse.json({ error: 'tenantValue is required when scope is "tenant"' }, { status: 400 })
    }
    const effectiveTenant = effectiveScope === 'tenant' ? tenantValue : null

    // Idempotent: return existing suppression if one already exists for this fingerprint+scope.
    const existing = await db.suppression.findFirst({
      where: { fingerprint, scope: effectiveScope, tenantValue: effectiveTenant },
    })

    if (existing) {
      const matchCount = await db.issue.count({
        where: effectiveScope === 'global'
          ? { fingerprint }
          : { fingerprint, projectId: effectiveTenant ?? undefined },
      })
      return NextResponse.json({
        id: existing.id,
        fingerprint: existing.fingerprint,
        reason: existing.reason,
        scope: existing.scope,
        author: existing.authorId,
        createdAt: existing.createdAt.toISOString(),
        lastMatched: existing.lastMatchedAt?.toISOString() ?? null,
        matchCount,
      })
    }

    const suppression = await db.suppression.create({
      data: {
        fingerprint,
        reason: reason ?? '',
        scope: effectiveScope,
        tenantValue: effectiveTenant,
        authorId: authorId ?? 'system',
      },
    })

    return NextResponse.json({
      id: suppression.id,
      fingerprint: suppression.fingerprint,
      reason: suppression.reason,
      scope: suppression.scope,
      author: suppression.authorId,
      createdAt: suppression.createdAt.toISOString(),
      lastMatched: null,
      matchCount: 0,
    })
  } catch (error) {
    console.error('Suppression creation error:', error)
    return NextResponse.json({ error: 'Failed to create suppression', details: String(error) }, { status: 500 })
  }
}
