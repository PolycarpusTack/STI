# TDR-005 · No rate limiting on LLM-triggering endpoints

**Opened**: 2026-04-29  
**Area**: src/app/api/pipeline/run/route.ts, src/app/api/brief/[id]/route.ts  
**Interest rate**: Medium  
**Status**: Open

## What we did

`POST /api/pipeline/run` and `POST /api/brief/[id]` each trigger LLM API calls. There is no per-IP or per-user rate limit. The in-process pipeline mutex prevents concurrency but not rapid serial calls.

## Why

Internal tool assumption: only trusted team members trigger these endpoints. Rate limiting was considered YAGNI for the first pass.

## Cost if not paid

- Any network-reachable user (or script) can burn LLM tokens at the provider's max rate
- A compromised internal machine or a port 3000 bypass (see F3) allows key exhaustion
- No cost visibility until the monthly bill arrives

## Resolution

Add a simple in-memory sliding-window rate limiter (e.g. using `lru-cache`) to these two endpoints. A limit of 5 requests/minute per IP is sufficient for normal use and prevents abuse.
