---
id: pt-2bma
status: in_progress
deps: []
links: []
created: 2026-08-29T15:48:37Z
type: feature
priority: 1
assignee: ProbabilityEngineer
---
# Bundle platform-specific turnlog CLI binaries

Package turnlog CLI binaries for macOS arm64/x64 and Linux arm64/x64 so npm installation of pi-turnlog provides the correct executable without a separate Cargo install.

## Design

Use four platform npm packages with optionalDependencies, resolve the matching package from the extension, and retain TURNLOG_BIN/PATH fallback. Add package metadata and release documentation.

## Acceptance Criteria

Each supported platform resolves a bundled executable; unsupported platforms receive actionable errors; npm package contents and install behavior are tested; main package and platform packages have coordinated versions.

