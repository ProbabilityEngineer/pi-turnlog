# Agent Instructions

## Project

- `pi-turnlog` integrates turn/session provenance with Pi.
- Keep the prompt and slash-command surface compact; provenance records must remain small, explicit, and inspectable.
- Extension entry point: `index.ts`. Platform CLI packages are under `packages/`.
- Pi core packages and `typebox` belong in `peerDependencies`, not `dependencies`.

## Validation and releases

- Run `npm run lint` after implementation changes.
- The cross-platform release workflow publishes platform packages before the main package and creates the release tag only after successful publication.
- Inspect `git status` and the diff before committing or pushing.

## Work tracking

- Use GitHub Issues via `gh` as the authoritative tracker for new work.
- Before substantial work, inspect existing issues and read the relevant issue with `gh issue view`; create an issue if needed.
- Keep acceptance checklists, progress, validation evidence, and dependencies in the issue. Do not duplicate task state in `clu` or standalone Markdown todo lists.
- Close issues only after their acceptance criteria are validated; leave incomplete or blocked work open.
- Existing `clu` records are historical; do not delete or migrate them without an explicit request.
- Turnlog is opt-in: use it only when explicitly requested, not as a routine edit or commit prerequisite.

## Local state

- Keep `.pi/`, `.clu/*.sqlite*`, `.clu/backups/`, and `.turnlog/` out of GitHub; commit `.clu/config.yaml` and `.clu/templates/` as shareable workflow configuration.
