import { PrismaClient } from '@prisma/client'
import path from 'path'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// Next.js/Turbopack can change the process CWD for route handlers, so a
// relative `file:./db/...` URL would resolve to the wrong location. Expand
// it to an absolute path once at module load time while the CWD is still
// the project root (where next.config.ts lives).
function datasourceUrl(): string {
  const url = process.env.DATABASE_URL ?? 'file:./db/custom.db'
  if (/^file:[./\\]/.test(url)) {
    return 'file:' + path.resolve(url.slice(5))
  }
  return url
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasources: { db: { url: datasourceUrl() } },
    log: process.env.NODE_ENV === "development" ? ["query"] : [],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
