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

- Use `clu` as the authoritative source of project tasks and work state.
- For substantial work, run `clu ready`, claim work with context, and read inherited context before editing.
- Add discovered work and task-specific notes to `clu`; close tasks only after validation.
- Use Turnlog separately for decisions, experiments, rationale, and lessons learned.

## Local state

- Keep `.pi/`, `.clu/`, and `.turnlog/` out of GitHub. They are local agent/task/provenance state.
