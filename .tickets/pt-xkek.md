---
id: pt-xkek
status: in_progress
deps: []
links: []
created: 2026-08-29T15:48:37Z
type: task
priority: 1
assignee: ProbabilityEngineer
---
# Automate cross-platform binary release with GitHub Actions

Build and publish turnlog binaries for macOS arm64/x64 and Linux arm64/x64 through GitHub Actions, publishing platform packages and pi-turnlog only after validation.

## Design

Use tagged releases or workflow dispatch with Rust target builds, executable smoke tests, npm pack/install checks, and ordered npm publishing.

## Acceptance Criteria

Workflow builds all four targets, validates binaries, publishes platform packages before main package, and documents required npm/GitHub secrets and release steps.


## Notes

**2026-08-29T18:05:42Z**

0.4.1 run exposed two workflow issues: empty token input after CLI became public and foreign arm64 execution exit 126. Follow-up 0.4.2 removes token, skips execution for Linux arm64, validates with file, and upgrades artifact actions to v5.
