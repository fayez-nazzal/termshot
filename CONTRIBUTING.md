# Contributing

Thanks for helping improve `termshot`.

## Setup

```sh
bun install
bun run build
```

`bun run build` writes `dist/termshot`. It is build output and is not committed.

## Tests

```sh
bun test
```

The tests need no terminal app and no permissions. `test/e2e.test.ts` builds `dist/termshot` and runs it. CI runs the suite on Linux with `zsh` installed.

## Adding an adapter

Each concern sits in its own folder under `src/`: `shell/`, `command-run/`, `terminal-emulation/`, `prompt/`, `highlighting/`, `theme/`, `rendering/` and `publishing/`. Each folder has a port file with the interface and a `registry.ts` with the adapters. To add one, write an adapter beside the existing ones, register it in that folder's `registry.ts`, and add tests for it. The flags, config keys, help text and errors all read the list from the registry. `test/architecture.test.ts` fails if any other source file names a vendor.

## Code style

- No code comments. Names carry the intent.
- One return at the end. No early return and no guard clause.
- One line per declaration, assignment, argument and call.
- `if` statements over ternaries.
- Explicit braces and explicit parentheses always.
- Plain checks over clever operators.

## Proposing a change

- Open an issue first for anything larger than a small fix.
- Keep each change focused on one thing.
- Add or update a test for the behaviour you change.
- Run `bun test` and make sure it passes.
- Update `README.md` and `AGENTS.md` when a flag or an output field changes.
- Open a pull request and fill in the template.
