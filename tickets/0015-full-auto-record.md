# Full auto-recording

Record assistant turns automatically when explicitly enabled.

## Acceptance

- lifecycle hook is finalized assistant `message_end`
- dedupe uses the message id or Pi turn index where available
- disabled by default
- `/turnlog-auto` toggles auto-recording
- auto-record stores only a short summary, not transcript text or diffs
