---
id: pt-auto-init-on-use
status: closed
deps: []
links: []
created: 2026-06-01T00:00:00Z
type: feature
priority: 2
assignee: ProbabilityEngineer
---
# Auto-initialize turnlog when a record is attempted

When an agent calls turnlog from a repo that has not been initialized yet, the current failure is noisy and interrupts the provenance flow:

```text
Error: not in an turnlog repo; run `turnlog init`
```

## Design

Add an opt-in auto-init path for record-like workflows. If `turnlog record` is called with an auto-init option and no turnlog repo exists, initialize turnlog first, then continue the requested operation.

Possible UX:

```bash
turnlog record --auto-init --summary "..."
```

or equivalent tool/API option:

```ts
{ action: "record", summary: "...", autoInit: true }
```

## Acceptance

- Record attempts can opt into initializing turnlog automatically when missing.
- Existing explicit failure remains available when auto-init is not enabled.
- Auto-init is idempotent when turnlog is already initialized.
- Output is concise and explains that turnlog was initialized before recording.


## Closure

Implemented opt-in `--auto-init` / `autoInit` for record workflows. Existing record behavior remains explicit unless the flag/parameter is set.

Validated with `npx tsc --noEmit --skipLibCheck --module nodenext --moduleResolution nodenext --target es2022 index.ts`.
