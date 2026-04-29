# TDR-006 · Prompt injection via Sentry issue data; scrubber gaps

**Opened**: 2026-04-29  
**Area**: src/lib/brief.ts, src/lib/scrubber.ts  
**Interest rate**: Medium  
**Status**: Open

## What we did

Issue titles, culprits, and stacktraces from Sentry are injected into the LLM prompt with only PII redaction applied. An adversary who can write to a Sentry project can craft issue data that overrides model instructions. Additionally, the scrubber has two gaps:

1. IPv4 private-range addresses are not redacted (e.g. internal DB hosts in stacktraces)
2. `SECRET_KV_RE` requires the key name to appear as a bare word — JSON-style `"access_key": "AKIA..."` forms pass through unredacted

## Why

The scrubber was written to address the known PII categories at design time. IPv4 addresses and JSON-key patterns were not in scope for the initial pass. Prompt injection defences were considered low-risk for a trusted internal tool.

## Cost if not paid

- A compromised Sentry account can influence LLM triage output (wrong lean, fabricated summaries)
- Internal hostnames and AWS access keys may reach the LLM provider's servers

## Resolution

1. Wrap Sentry data in an explicit `<issue_data>` block in the user message to signal untrusted content to the model
2. Add IPv4 private-range scrubbing: `const IPV4_RE = /\b(?:10\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}|192\.168\.\d{1,3})\.\d{1,3}\b/g`
3. Extend `SECRET_KV_RE` to match JSON-style `"key": "value"` forms
