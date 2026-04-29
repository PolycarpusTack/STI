# TDR-001 · No test coverage on any module

**Opened**: 2026-04-23  
**Closed**: 2026-04-24  
**Area**: src/lib/, src/app/api/, components/  
**Interest rate**: High  
**Status**: Closed

## What we did

Shipped the entire Phase 1 pipeline (sentry.ts, scrubber.ts, brief.ts, settings.ts, meta.ts, all API routes) and Phase 2 cockpit components without a single test. No test runner is configured.

## Why

Speed of initial prototyping. The goal was to get a working end-to-end demo before validating the approach.

## Cost if not paid

- Every refactor is a manual regression risk  
- Bugs in the scrubber (PII leaking to LLM) have no automatic detection  
- Jira integration (EPIC-1) cannot be safely developed without a mock for the Jira API  
- The TDD requirement in BACKLOG.md is impossible to meet  

## Resolution

Full test suite established with `bun test`. Tests use `mock.module("@/lib/db", ...)` pattern for isolated unit tests. In-memory SQLite via `DATABASE_URL=file::memory:` in `src/test/setup.ts` (loaded via `bunfig.toml` preload). All new API routes and lib modules now follow TDD — tests written before implementation. 211 tests passing as of v0.4.
