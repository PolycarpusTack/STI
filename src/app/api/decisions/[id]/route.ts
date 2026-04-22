import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const decision = await db.decision.findUnique({
      where: { id },
    })

    if (!decision) {
      return NextResponse.json({ error: 'Decision not found' }, { status: 404 })
    }

    const deleted = await db.decision.delete({
      where: { id },
    })

    return NextResponse.json({ decision: deleted })
  } catch (error) {
    console.error('Decision deletion error:', error)
    return NextResponse.json({ error: 'Failed to delete decision', details: String(error) }, { status: 500 })
  }
}
