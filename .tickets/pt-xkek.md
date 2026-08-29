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

