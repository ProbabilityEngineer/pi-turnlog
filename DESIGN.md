# pi-turnlog Design

## Choice

Start with a **minimal wrapper**.

## Why

- keeps `turnlog` as the source of truth
- reduces integration risk
- lets us ship Pi commands quickly

## Scope

- call `turnlog` subcommands from Pi extension commands
- surface session/turn status in Pi
- optionally pass through common flags

## Non-goals

- reimplement storage
- add new provenance formats
- mutate VCS history
