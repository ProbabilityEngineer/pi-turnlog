---
id: pt-gitignore-turnlog-on-init
status: closed
type: feature
priority: 1
created: 2026-06-01T20:20:00Z
---
# Add .turnlog to .gitignore on initialization

Ensure `.turnlog/` remains local-only by default. When pi-turnlog initializes turnlog storage, it should add `.turnlog/` to the repo `.gitignore` if not already present.

## Acceptance Criteria

- `turnlog action=init` through the Pi tool initializes turnlog and ensures `.turnlog/` is ignored.
- `/turnlog-start` initialization path ensures `.turnlog/` is ignored.
- Auto-init record workflows ensure `.turnlog/` is ignored.
- Existing `.gitignore` entries `.turnlog` or `.turnlog/` are respected without duplication.
- README documents local-only default.

## Closure

Implemented `ensureTurnlogIgnored` and `initTurnlog`; wired explicit init, start initialization, and auto-init paths. Validated with `npm run lint` and LSP diagnostics.
