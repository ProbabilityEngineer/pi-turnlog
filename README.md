# pi-turnlog

Pi extension layer for `turnlog`.

## Goal

Provide a thin Pi-facing wrapper around the `turnlog` CLI for durable session and turn provenance.

## Local usage

Copy or symlink the installed package into Pi, then reload Pi.

## Commands

The slash-command surface is intentionally compact:

- `/turnlog-status` — show current turnlog/VCS status.
- `/turnlog-start --goal "..." [--ticket ...]` — initialize `.turnlog/` if needed and start a new session.
- `/turnlog-record [--summary "..."]` — record the latest assistant turn only when repository changes make it meaningful.

## Tool

One compact model-visible tool:

```text
turnlog action: status/init/start/record/report/auto
```

Use the tool when the user wants durable provenance, handoff records, or a session report.

## Notes

- quoted arguments are supported
- `TURNLOG_BIN` overrides the executable path
- stdout/stderr are surfaced in Pi
- auto-recording is off by default and can be enabled with `turnlog action=auto enabled=true`
- auto-record and `/turnlog-record` skip chat-only turns when no repository change is detected
- source entrypoint is `src/index.ts`
