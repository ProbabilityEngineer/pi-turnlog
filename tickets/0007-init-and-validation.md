# Init and argument validation

Add a Pi command for `turnlog init` and validate required args before spawning the CLI.

## Acceptance

- `/turnlog-init` exists
- `/turnlog-start` rejects empty args early
- `/turnlog-show` and `/turnlog-report` require exactly one ID
- error messages are clearer than raw clap usage where possible
