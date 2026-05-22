# pi-turnlog

Pi extension layer for `turnlog`.

## Goal

Provide a thin Pi-facing wrapper around the `turnlog` CLI.

## Local usage

Copy or symlink `.pi/extensions/pi-turnlog/` into your project-local `.pi/extensions/` directory, then reload Pi.

## Commands

- `/turnlog-init`
- `/turnlog-status`
- `/turnlog-start`
- `/turnlog-record`
- `/turnlog-show`
- `/turnlog-report`

## Notes

- quoted arguments are supported
- `TURNLOG_BIN` overrides the executable path
- stdout/stderr are surfaced in Pi
