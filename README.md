# pi-turnlog

Pi extension layer for `turnlog`.

## Goal

Provide a thin Pi-facing wrapper around the `turnlog` CLI.

## Local usage

Copy or symlink the installed package into Pi, then reload Pi.

## Commands

- `/turnlog-init`
- `/turnlog-status`
- `/turnlog-current`
- `/turnlog-context`
- `/turnlog-footer`
- `/turnlog-start --goal "..." [--ticket ...]`
- `/turnlog-record [--summary "..."]`
- `/turnlog-record-turn [--summary "..."]`
- `/turnlog-show <id>`
- `/turnlog-report <id>`

## Notes

- quoted arguments are supported
- `TURNLOG_BIN` overrides the executable path
- `/turnlog-record` prompts for a summary when called without arguments
- `/turnlog-record-turn` opens an editor with a suggested summary from the latest assistant turn
- stdout/stderr are surfaced in Pi
- the status footer is off by default and can be toggled with `/turnlog-toggle`
- source entrypoint is `src/index.ts`
