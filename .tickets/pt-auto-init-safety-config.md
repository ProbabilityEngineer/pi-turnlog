---
id: pt-auto-init-safety-config
status: closed
deps: []
links: []
created: 2026-06-01T00:00:00Z
type: task
priority: 3
assignee: ProbabilityEngineer
---
# Define safety policy for turnlog auto-init

Auto-initializing turnlog may create files in a repo. Define when that is safe and how users can opt in or out.

## Design questions

- Where should turnlog metadata live so auto-init is low-noise?
- Should auto-init require an explicit flag, config, environment variable, or prior user preference?
- Should Pi/tool calls be allowed to auto-init by default while CLI remains explicit?
- How should auto-init behave in non-repo directories or read-only paths?

## Acceptance

- Documented policy for auto-init safety.
- Config or flag behavior is explicit.
- Auto-init never silently overwrites existing data.
- Errors are concise and actionable when auto-init is unsafe.


## Closure

Documented and implemented explicit opt-in safety policy: auto-init only runs when `--auto-init` or `autoInit` is supplied; it uses turnlog init idempotently and does not overwrite existing data.

Validated with `npx tsc --noEmit --skipLibCheck --module nodenext --moduleResolution nodenext --target es2022 index.ts`.
