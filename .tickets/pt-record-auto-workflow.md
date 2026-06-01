---
id: pt-record-auto-workflow
status: open
deps: [pt-auto-init-on-use, pt-auto-start-on-record]
links: []
created: 2026-06-01T00:00:00Z
type: feature
priority: 2
assignee: ProbabilityEngineer
---
# Add one-shot auto workflow for turnlog record

Agents need a low-friction way to record useful provenance without handling initialization/session state manually. A one-shot auto workflow should perform init, start, and record as needed.

## Design

Expose a compact command/API path such as:

```bash
turnlog auto --goal "..." --summary "..."
```

or:

```bash
turnlog record --auto-init --auto-start --goal "..." --summary "..."
```

Behavior:

1. If not initialized, initialize turnlog.
2. If no active session exists, start one.
3. Record the supplied summary.
4. Report only meaningful actions taken.

## Acceptance

- A single call can init, start, and record.
- Repeated calls in an initialized repo with an active session only append records.
- Failure output includes enough diagnostics to recover manually.
- Tool/API schema supports the same workflow used by the CLI.
