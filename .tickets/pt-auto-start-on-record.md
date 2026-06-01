---
id: pt-auto-start-on-record
status: closed
deps: [pt-auto-init-on-use]
links: []
created: 2026-06-01T00:00:00Z
type: feature
priority: 2
assignee: ProbabilityEngineer
---
# Auto-start a turnlog session when recording without an active session

After turnlog is initialized, `turnlog record` can still fail if no active session exists. For agent workflows, record should be able to opt into starting a session automatically.

## Design

Add an auto-start option for `record`. If no active session exists, create one with a generated or supplied goal, then retry the record.

Possible UX:

```bash
turnlog record --auto-start --goal "Continue repo maintenance" --summary "..."
```

or equivalent tool/API option:

```ts
{ action: "record", goal: "Continue repo maintenance", summary: "...", autoStart: true }
```

If no goal is supplied, generate a conservative default such as:

```text
Record repository work and continuation context
```

## Acceptance

- `record --auto-start` starts a session when none is active.
- The record is written after the session starts.
- If a session is already active, no extra session is created.
- The user-visible output is compact and includes the new session id when one was created.


## Closure

Implemented opt-in `--auto-start` / `autoStart` for record workflows. If no active session is detected, pi-turnlog starts one with supplied goal or conservative default before recording.

Validated with `npx tsc --noEmit --skipLibCheck --module nodenext --moduleResolution nodenext --target es2022 index.ts`.
