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

The unit tests are pure and run on any platform. Running `termshot` for real needs macOS, `screencapture` and Ghostty.

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
