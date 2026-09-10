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
- At the start of substantial work, run `clu ready`, then use `clu claim --context` or claim the specifically requested task; read inherited context before editing.
- Put newly discovered work, notes, and dependencies in `clu`, not Markdown todo lists.
- Close completed work in `clu` after validation; leave incomplete or blocked work represented there.
- Use Turnlog separately for decisions, experiments, rationale, and lessons learned.

## Local state

- Keep `.pi/`, `.clu/*.sqlite*`, `.clu/backups/`, and `.turnlog/` out of GitHub; commit `.clu/config.yaml` and `.clu/templates/` as shareable workflow configuration.
