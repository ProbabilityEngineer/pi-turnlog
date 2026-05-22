# Command argument parsing

Parse Pi command arguments with quotes and escaped spaces instead of naive splitting.

## Acceptance

- quoted args survive intact
- empty input is handled cleanly
- command wrappers reuse the parser
