---
id: pt-5nvx
status: closed
deps: []
links: []
created: 2026-08-29T17:53:56Z
type: bug
priority: 1
assignee: ProbabilityEngineer
---
# Fix public CLI release checkout and bump 0.4.1

Remove the now-unnecessary empty private-repository token input from the release workflow, ensure all checkout/setup-node actions use current Node-compatible versions, and bump the main/platform package manifests for a patch release.

## Acceptance Criteria

Public turnlog checkout works without secrets; no checkout Node 20 warnings; package versions consistently 0.4.1; lint and workflow validation pass.

