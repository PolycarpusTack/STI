# TDR-004 · Internal error details returned to API clients in production

**Opened**: 2026-04-29  
**Area**: src/app/api/ (all routes)  
**Interest rate**: Medium  
**Status**: Open

## What we did

All API error handlers return `details: String(error)` unconditionally. A Prisma constraint violation includes the table name, column name, and offending value; a file-system error includes absolute paths.

## Why

Copy-paste from initial scaffolding. The `details` field was useful during development and never gated on environment.

## Cost if not paid

- Internal schema structure, file paths, and query text are readable by any network user who can trigger an error
- Errors shipped to an external log aggregator include raw stack traces

## Resolution

Wrap `details` behind a `NODE_ENV !== 'production'` guard across all routes in `src/app/api/`. Pattern:

```typescript
const detail = process.env.NODE_ENV !== 'production' ? String(error) : undefined;
return NextResponse.json({ error: 'Failed to ...', ...(detail ? { details: detail } : {}) }, { status: 500 });
```
