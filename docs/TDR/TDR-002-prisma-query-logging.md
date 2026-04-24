# TDR-002 · Prisma query logging unconditionally enabled

**Opened**: 2026-04-23  
**Area**: src/lib/db.ts  
**Interest rate**: Medium  
**Status**: Open

## What we did

PrismaClient is initialised with `log: ['query']` unconditionally, which prints every SQL query to stdout regardless of environment.

## Why

Default copy from early scaffolding; never revisited.

## Cost if not paid

- Every production request prints SQL to the server log — noise that buries real errors  
- If logs are shipped to an aggregator, query strings (including any parameter values) are stored externally  
- Performance: string formatting overhead on every DB call  

## Payoff plan

BACKLOG.md TASK-5.1 — two-line fix: wrap in `process.env.NODE_ENV === "development"`.  
Estimated effort: XS (< 15 minutes).
