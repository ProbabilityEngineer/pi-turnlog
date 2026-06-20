# pi-turnlog

> One of my diet context engineering and workflow extensions. Add pi-diet-LSP, pi-diet-Ripgrep, pi-repo-move and others from [npm](https://www.npmjs.com/~probabilityengineer).

Pi extension layer for `turnlog`.

## Goal

Provide a thin Pi-facing wrapper around the `turnlog` CLI for durable session and turn provenance.

## Install

Install the Rust CLI first:

```bash
cargo install turnlog
```

Then install the Pi extension:

```bash
pi install npm:pi-turnlog
```

From GitHub:

```bash
pi install git:github.com/ProbabilityEngineer/pi-turnlog
```

For local testing:

```bash
pi -e ./index.ts
```

## Commands

The slash-command surface is intentionally compact:

- `/turnlog-status [--cwd /path/to/repo]` — show current turnlog/VCS status.
- `/turnlog-start --goal "..." [--ticket ...] [--cwd /path/to/repo]` — initialize `.turnlog/` if needed and start a new session.
- `/turnlog-record [--summary "..."] [--auto-init] [--auto-start] [--goal "..."] [--cwd /path/to/repo]` — record the latest assistant turn only when repository changes make it meaningful.

## Tool

One compact model-visible tool:

```text
turnlog action: status/init/start/record/report/auto [cwd=/path/to/repo]
```

Use the tool when the user wants durable provenance, handoff records, or a session report. Agents should also use it proactively for meaningful repository work: code/docs/ticket changes, commits/pushes, ticket closures, multi-repo work, validation, and handoff context. Do not record routine chat-only turns. Before the final commit/push for a coherent repo change, record what changed, why, validation performed, tickets touched, and intended VCS finalization; if `.turnlog/` is tracked in that repo, include those changes in the same commit. Do not record again after push unless committing that follow-up provenance record too. If a record attempt finds turnlog uninitialized, initialize it; auto-start a session for meaningful repo work unless the user forbids persistence.

## Missing CLI behavior

`pi-turnlog` is a thin wrapper and does not install the Rust CLI for you. If the `turnlog` executable is missing, commands and tools print an explicit install hint:

```bash
cargo install turnlog
```

If `turnlog` is installed outside `PATH`, start Pi with:

```bash
TURNLOG_BIN=/absolute/path/to/turnlog pi
```

## Notes

- quoted arguments are supported
- `TURNLOG_BIN` overrides the executable path
- stdout/stderr are surfaced in Pi
- auto-recording is off by default and can be enabled with `turnlog action=auto enabled=true`
- pass `cwd` (tool) or `--cwd`/`-C` (commands) when Pi is running in one directory but the agent is changing another repository
- auto-record automatically initializes turnlog and starts a conservative session when meaningful repository changes exist in Pi's current cwd
- auto-record and `/turnlog-record` skip chat-only turns when no repository change is detected
- `turnlog init` through this extension adds `.turnlog/` to `.gitignore` so local provenance is not pushed to GitHub by default
- `/turnlog-record --goal "..." --summary "..."` initializes turnlog and starts a session when needed before recording meaningful repo changes; use `--no-auto-init` or `--no-auto-start` only when explicitly desired
- source entrypoint is `index.ts`
