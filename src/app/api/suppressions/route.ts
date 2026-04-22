import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

export async function GET() {
  try {
    const suppressions = await db.suppression.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: { issues: true },
        },
      },
    })

    // Format to match frontend Suppression interface
    const formatted = suppressions.map(s => ({
      id: s.id,
      fingerprint: s.fingerprint,
      reason: s.reason,
      scope: s.scope,
      author: s.authorId,
      createdAt: s.createdAt.toISOString(),
      lastMatched: s.lastMatchedAt?.toISOString() ?? null,
      matchCount: s._count.issues,
    }))

    return NextResponse.json(formatted)
  } catch (error) {
    console.error('Suppressions fetch error:', error)
    return NextResponse.json({ error: 'Failed to fetch suppressions', details: String(error) }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { fingerprint, reason, scope, authorId } = body

    if (!fingerprint) {
      return NextResponse.json({ error: 'fingerprint is required' }, { status: 400 })
    }

    const suppression = await db.suppression.create({
      data: {
        fingerprint,
        reason: reason ?? '',
        scope: scope ?? 'global',
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
