# TDR-003 · Jira modal submits but never creates a ticket

**Opened**: 2026-04-23  
**Area**: src/app/api/decisions/route.ts, src/components/cockpit/jira-modal.tsx  
**Interest rate**: High  
**Status**: Open

## What we did

The Jira modal UI is complete and submits a form. The decisions API receives the payload but discards all metadata fields. No Jira API call is ever made. No Jira credentials exist in the codebase.

## Why

Jira credentials and project key were not confirmed at design time. The UI was built to spec; the integration was deferred.

## Cost if not paid

- Every "create Jira" action is silently a no-op — users don't know their tickets don't exist  
- Decision records have no Jira key, making the audit trail incomplete  
- Trust in the tool erodes when users check Jira and see nothing  

## Payoff plan

BACKLOG.md EPIC-1 (all four tasks).  
Estimated effort: L (1–2 days including Jira credential setup and end-to-end test).
