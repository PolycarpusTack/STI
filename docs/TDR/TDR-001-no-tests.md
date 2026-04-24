# TDR-001 · No test coverage on any module

**Opened**: 2026-04-23  
**Area**: src/lib/, src/app/api/, components/  
**Interest rate**: High  
**Status**: Open

## What we did

Shipped the entire Phase 1 pipeline (sentry.ts, scrubber.ts, brief.ts, settings.ts, meta.ts, all API routes) and Phase 2 cockpit components without a single test. No test runner is configured.

## Why

Speed of initial prototyping. The goal was to get a working end-to-end demo before validating the approach.

## Cost if not paid

- Every refactor is a manual regression risk  
- Bugs in the scrubber (PII leaking to LLM) have no automatic detection  
- Jira integration (EPIC-1) cannot be safely developed without a mock for the Jira API  
- The TDD requirement in BACKLOG.md is impossible to meet  

## Payoff plan

BACKLOG.md TASK-5.6 — set up bun test infrastructure and seed tests for every lib module.  
Estimated effort: M (half a day).  
This is a prerequisite for all other backlog tasks.
