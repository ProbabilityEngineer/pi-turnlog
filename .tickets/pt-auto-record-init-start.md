---
id: pt-auto-record-init-start
status: closed
type: bug
priority: 1
created: 2026-06-01T20:40:00Z
---
# Auto-record should auto-init and auto-start

When auto-record is enabled, `message_end` currently attempts `turnlog record` directly after detecting repository changes. In repos that are not initialized or have no active session, this emits noisy warnings.

## Acceptance Criteria

- Auto-record initializes turnlog when needed.
- Auto-record starts a conservative session when no active session exists.
- Chat-only/no-change turns are still skipped without a notification.
- README documents the behavior.

## Closure

Auto-record now uses `recordIfMeaningful` with `autoInit` and `autoStart` enabled and default goal `Automatic Pi turn provenance`; no-change results are suppressed. Validated with `npm run lint` and LSP diagnostics.
