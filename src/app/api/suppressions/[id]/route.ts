import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const suppression = await db.suppression.findUnique({
      where: { id },
    })

    if (!suppression) {
      return NextResponse.json({ error: 'Suppression not found' }, { status: 404 })
    }

    const deleted = await db.suppression.delete({
      where: { id },
    })

    return NextResponse.json({ suppression: deleted })
  } catch (error) {
    console.error('Suppression deletion error:', error)
    return NextResponse.json({ error: 'Failed to delete suppression', details: String(error) }, { status: 500 })
  }
}
