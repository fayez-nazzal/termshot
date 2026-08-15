# termshot

[![CI](https://github.com/fayez-nazzal/termshot/actions/workflows/ci.yml/badge.svg)](https://github.com/fayez-nazzal/termshot/actions/workflows/ci.yml) [![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

`termshot` runs one command in a fresh Ghostty window on macOS, captures that window to a PNG, and prints a JSON record of the run on stdout.

Use it to produce evidence images for pull requests, issues and docs, and to let an agent read the result without opening the image.

`termshot` is built to be called by an AI coding agent. Every run prints one JSON line with `capture.path`, `capture.sha256` and a `status`, backed by the exit-code table below, so an agent can prove the PNG exists without ever loading the bytes. See `AGENTS.md` for the recipes and the traps.

## Requirements

- macOS, for the built in `screencapture` tool.
- [Bun](https://bun.sh) to install and run.
- Screen Recording permission for your terminal, under `System Settings` then `Privacy & Security`.
- [Ghostty](https://ghostty.org), because every capture runs in a Ghostty window.
- [rclone](https://rclone.org) only if you use `--publish`.

## Install

With Homebrew:

```sh
brew install fayez-nazzal/tap/termshot-cap
```

The formula is called `termshot-cap` because Homebrew core already owns the name `termshot`. The installed command is still `termshot`, so it shadows nothing and reads the same everywhere.

From source:

```sh
bun install
bun run build
bun link
```

`bin` points at `dist/termshot`, which is build output and is not committed. A fresh clone must run `bun run build` before `bun link`.

`bun link` puts a global `termshot` command in `~/.bun/bin`. Add that folder to your `PATH`:

```sh
echo 'export PATH="$HOME/.bun/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

## Use it with your AI agent

`termshot` is built to be driven by an AI coding agent. The bundled skill teaches your agent when to reach for `termshot` and how to call it.

One command sets it up:

```sh
curl -fsSL https://raw.githubusercontent.com/fayez-nazzal/termshot/main/scripts/install-skill.sh | bash
```

It asks which agents to set up. It defaults to Claude Code.

For scripts and CI, use the non-interactive form:

```sh
curl -fsSL https://raw.githubusercontent.com/fayez-nazzal/termshot/main/scripts/install-skill.sh | bash -s -- --agents claude -y
```

- `--agents` accepts `claude`, `codex`, `cursor`, `opencode`, `grok`, `antigravity` or `all`.
- `--scope user` installs for every project instead of just this one.

### Claude Code plugin

Claude Code users can instead install the whole repo as a plugin:

```sh
/plugin marketplace add fayez-nazzal/termshot
/plugin install termshot
```

### Supported agents

Project scope paths:

| Agent | Skill path |
|---|---|
| Claude Code | `.claude/skills/termshot/` |
| OpenAI Codex CLI | `.agents/skills/termshot/` |
| Cursor | `.cursor/skills/termshot/` |
| opencode | `.opencode/skills/termshot/` |
| xAI Grok CLI | `.grok/skills/termshot/` |
| Google Antigravity | `.agents/skills/termshot/` |

See `AGENTS.md` for the full recipes.

## Daily use

```sh
termshot --run "ls -la"                        # capture a command
termshot --run "ls -la" -o shot.png            # write to a chosen path
termshot --run "htop" --cols 160 --rows 45     # use a bigger terminal grid
termshot --run "ls" --settle 1000              # wait longer before capturing
termshot --run "ls" --publish myremote:shots/  # upload and print an embed line
```

`--run` is required. Without it the run ends with a usage error and exit code 2.

The default output path is `~/termshot/<timestamp>.png`.

## Options

| Flag | What it does | Default |
|------|--------------|---------|
| `--run <command>` | Run the command in a fresh Ghostty window and capture it | required |
| `-o, --output <path>` | Output PNG path | `~/termshot/<timestamp>.png` |
| `--settle <ms>` | Wait after the window appears, before capturing | `500` |
| `--cols <n>` | Width of the window in terminal columns | `120` |
| `--rows <n>` | Height of the window in terminal rows | `30` |
| `--publish <dest>` | Upload the PNG to an `rclone` remote folder, make it public, print an embed line | none |
| `--publish-size <px>` | Long edge width for the embed | `2560` |
| `--publish-label <text>` | Alt text for the embed | the output PNG path |
| `-h, --help` | Show help | |
| `-v, --version` | Show version | |

`--settle`, `--cols`, `--rows` and `--publish-size` each take a positive whole number.

That table is the whole flag set. Anything else ends the run with exit code 2.

These eight flags were removed and now report that they were removed: `--annotate`, `--copy`, `--window-pick`, `--box`, `--marker`, `--list`, `--window` and `--stdout`.

## Output

Every run prints one JSON line on stdout, success or failure.

Real record from `termshot --run "echo hi" -o demo.png` on this machine:

```json
{"tool":"termshot","version":"0.5.1","status":"ok","exitCode":0,"command":{"argv":["echo hi"],"exitStatus":0,"durationMs":1,"timedOut":false},"capture":{"path":"/tmp/demo.png","bytes":42664,"width":1936,"height":1036,"sha256":"544d9884c49949b47a3f78ea9c26679f6c6585cb2c4148f4feb40c3bdb3acad8"},"terminal":{"cols":120,"rows":30},"publish":{"requested":false,"url":null,"markdown":null,"verified":false},"errors":[]}
```

Notes on that record:

- `capture.path` is absolute, and `sha256` is the hash of the written PNG.
- The `terminal` block reports the grid the window was launched with, so `cols` and `rows` match the `--cols` and `--rows` values used for the run.
- stderr carries the human lines: one per entry in `errors`, then `termshot: wrote <path> (<n> bytes)` when a file was written.

## Exit codes

| Code | Status | Meaning |
|------|--------|---------|
| 0 | `ok` | Capture written |
| 1 | `command-failed` | The command ran and exited non zero |
| 2 | `usage-error` | Bad or missing flags |
| 3 | `environment-error` | The machine or Ghostty could not do the job |
| 4 | `timeout` | The command did not finish in time |
| 5 | `truncated` | Reserved. No run produces this code today |
| 6 | `publish-failed` | Upload step failed |
| 7 | `internal-error` | The PNG was written but could not be read back |

## Publishing

For `--publish` you need an `rclone` remote of your own. Create one with `rclone config`, then pass the remote and folder as the destination, for example `myremote:shots/`.

## How a capture stays clean

A capture shows the command output and nothing else. Four defaults make that true.

- The window opens with no titlebar, so the internal window handle never shows.
- A short settle and a screen clear remove the shell login banner.
- The terminal is told not to wait for a keypress, so no `Process exited` banner appears.
- The rows under the output are erased and the cursor is hidden.

`termshot` closes the window and the process it started once the capture is written, whether the capture worked or not.

If you run a tiling window manager, it may force the window to a size you did not ask for. Add a rule that floats windows titled `termshot-*`.

## Limits

- The window must appear within 15 seconds.
- The command must finish within 60 seconds.
- Neither limit is configurable.
- `--version` prints the `version` field from `package.json`.

## Development

```sh
bun test
bun run src/cli.ts --help
```

## Contributing

See `CONTRIBUTING.md`.

## License

MIT. See `LICENSE`.
