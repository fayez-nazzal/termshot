# termshot

[![CI](https://github.com/fayez-nazzal/termshot/actions/workflows/ci.yml/badge.svg)](https://github.com/fayez-nazzal/termshot/actions/workflows/ci.yml) [![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

`termshot` runs one command in a fresh terminal window on macOS (Ghostty or Alacritty), captures that window to a PNG, and prints a JSON record of the run on stdout.

Use it to produce evidence images for pull requests, issues and docs, and to let an agent read the result without opening the image.

`termshot` is built to be called by an AI coding agent. Every run prints one JSON line with `capture.path`, `capture.sha256` and a `status`, backed by the exit-code table below, so an agent can prove the PNG exists without ever loading the bytes. See `AGENTS.md` for the recipes and the traps.

## Requirements

- macOS, for the built in `screencapture` tool.
- [Bun](https://bun.sh) to install and run.
- Screen Recording permission for your terminal, under `System Settings` then `Privacy & Security`.
- One supported terminal in `/Applications`: [Ghostty](https://ghostty.org) (the default) or [Alacritty](https://alacritty.org). See [Choosing a terminal](#choosing-a-terminal).
- Only for `--publish`: [rclone](https://rclone.org) with a Google Drive remote, or the [GitHub CLI](https://cli.github.com) logged in. See [Publishing](#publishing).

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

From a clone, run the same script locally. It installs the repo's own copy of the skill:

```sh
bash scripts/install-skill.sh --agents claude --scope user -y
```

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
termshot --run "ls" --publish 42              # post the capture to PR 42 (publisher gh)
termshot --run "ls" --terminal alacritty       # use another terminal for one run
```

`--run` is required. Without it the run ends with a usage error and exit code 2.

The default output path is `~/termshot/<timestamp>.png`.

## Configuration

### Choosing a terminal

Supported terminals: `ghostty` (default) and `alacritty`. Save your choice once:

```sh
termshot config set terminal alacritty
```

Override it for a single run with `--terminal <name>`. The flag beats the config, and the config beats the default.

### Config commands

| Command | What it does |
|---------|--------------|
| `termshot config` | Print the effective config and its file path as one JSON line |
| `termshot config set <key> <value>` | Save a value |
| `termshot config unset <key>` | Revert a key to its default |

| Key | Values | Default |
|-----|--------|---------|
| `terminal` | `ghostty`, `alacritty` | `ghostty` |
| `publisher` | `rclone`, `gh` | `rclone` |

The config lives at `$XDG_CONFIG_HOME/termshot/config.json`, or `~/.config/termshot/config.json` when that variable is unset. An unknown key or value in the file stops every run with a `usage-error` that names the file.

Captures use your own terminal config for fonts and colours. termshot only overrides the window size, decorations and the command to run.

## Options

| Flag | What it does | Default |
|------|--------------|---------|
| `--run <command>` | Run the command in a fresh terminal window and capture it | required |
| `-o, --output <path>` | Output PNG path | `~/termshot/<timestamp>.png` |
| `--terminal <name>` | Terminal for this run only: `ghostty` or `alacritty` | the `terminal` config value |
| `--settle <ms>` | Wait after the window appears, before capturing | `500` |
| `--cols <n>` | Width of the window in terminal columns | `120` |
| `--rows <n>` | Height of the window in terminal rows | `30` |
| `--publish <dest>` | Upload the PNG publicly and put a Markdown embed in the record. See [Publishing](#publishing) | none |
| `--publisher <name>` | Publisher for this run only: `rclone` or `gh`. Needs `--publish` | the `publisher` config value |
| `--publish-size <px>` | Long edge width for the embed. `rclone` only | `2560` |
| `--publish-label <text>` | Alt text for the embed | the output PNG path |
| `-h, --help` | Show help | |
| `-v, --version` | Show version | |

`--settle`, `--cols`, `--rows` and `--publish-size` each take a positive whole number.

That table is the whole flag set, plus the `config` command above. Anything else ends the run with exit code 2.

These eight flags were removed and now report that they were removed: `--annotate`, `--copy`, `--window-pick`, `--box`, `--marker`, `--list`, `--window` and `--stdout`.

## Output

Every run prints one JSON line on stdout, success or failure.

Real record from `termshot --run "echo hi" -o demo.png` on this machine:

```json
{"tool":"termshot","version":"0.5.1","status":"ok","exitCode":0,"command":{"argv":["echo hi"],"exitStatus":0,"durationMs":1,"timedOut":false},"capture":{"path":"/tmp/demo.png","bytes":42664,"width":1936,"height":1036,"sha256":"544d9884c49949b47a3f78ea9c26679f6c6585cb2c4148f4feb40c3bdb3acad8"},"terminal":{"emulator":"ghostty","cols":120,"rows":30},"publish":{"requested":false,"publisher":null,"url":null,"markdown":null,"verified":false},"errors":[]}
```

Notes on that record:

- `capture.path` is absolute, and `sha256` is the hash of the written PNG.
- The `terminal` block reports which terminal ran the command in `emulator`, and the grid the window was launched with, so `cols` and `rows` match the `--cols` and `--rows` values used for the run. `emulator` is set even when the run fails.
- stderr carries the human lines: one per entry in `errors`, then `termshot: wrote <path> (<n> bytes)` when a file was written.

## Exit codes

| Code | Status | Meaning |
|------|--------|---------|
| 0 | `ok` | Capture written |
| 1 | `command-failed` | The command ran and exited non zero |
| 2 | `usage-error` | Bad or missing flags |
| 3 | `environment-error` | The machine or the terminal could not do the job |
| 4 | `timeout` | The command did not finish in time |
| 5 | `truncated` | Reserved. No run produces this code today |
| 6 | `publish-failed` | Upload step failed |
| 7 | `internal-error` | The PNG was written but could not be read back |

## Publishing

`--publish <dest>` uploads the PNG and puts its URL and a Markdown embed in `publish.url` and `publish.markdown`. Pick where it goes with the `publisher` config key, or `--publisher` for one run.

| Publisher | `<dest>` | What it does | One-time setup |
|-----------|----------|--------------|----------------|
| `rclone` | `remote:path`, for example `gdrive:PR-Shots/` | Copies the PNG to Google Drive and shares it by link | `brew install rclone`, then `rclone config` to add a Google Drive remote |
| `gh` | A pull request number, URL or branch | Posts the PNG as a comment on that PR, using `gh pr comment --attach` | `brew install gh` (2.102 or later), then `gh auth login` |

```sh
termshot config set publisher gh
termshot --run "bun test" -o /tmp/tests.png --publish 42
```

`gh` needs no storage repo: GitHub hosts the image as a PR attachment, visible to anyone who can see the PR.

A bad `<dest>` for the chosen publisher fails with `usage-error` before any window opens.

## How a capture stays clean

A capture shows the command output and nothing else. Four defaults make that true.

- The window opens with no titlebar, so the internal window handle never shows.
- A short settle and a screen clear remove the shell login banner.
- The terminal is told not to wait for a keypress, so no `Process exited` banner appears.
- The rows under the output are erased and the cursor is hidden.

`termshot` closes the window and the process it started once the capture is written, whether the capture worked or not.

If you run a tiling window manager, it may force the window to a size you did not ask for. Add a rule that floats windows titled `termshot-*`. For AeroSpace, put this first in `on-window-detected`, since the first match wins:

```toml
{ if.window-title-regex-substring = '^termshot-', run = ['layout floating'] },
```

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
