# termshot

[![CI](https://github.com/fayez-nazzal/termshot/actions/workflows/ci.yml/badge.svg)](https://github.com/fayez-nazzal/termshot/actions/workflows/ci.yml) [![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

`termshot` runs one command in a built-in headless terminal, renders the result to a PNG, and prints a JSON record of the run on stdout.

Use it to produce evidence images for pull requests, issues and docs, and to let an agent read the result without opening the image.

`termshot` is built to be called by an AI coding agent. Every run prints one JSON line with `capture.path`, `capture.sha256` and a `status`, backed by the exit-code table below, so an agent can prove the PNG exists without ever loading the bytes. See `AGENTS.md` for the recipes and the traps.

Nothing shows on screen during a capture. No terminal app, no window and no permission prompt are involved. The terminal emulator, the renderer and the font are all inside the `termshot` binary, and it needs no network access.

## Requirements

- macOS.
- [Bun](https://bun.sh), only to build from source.
- The shell named by the `shell` config key on your `PATH`. The default is `zsh`, which macOS ships.
- Only for `--publish`: [rclone](https://rclone.org) with a Google Drive remote, or the [GitHub CLI](https://cli.github.com) logged in. See [Publishing](#publishing).

## Upgrading to 0.7

- The terminal-app backend was removed. termshot draws the terminal itself.
- `--terminal` and `--settle` were removed. Passing either one is a `usage-error`.
- `~/.config/termshot/config.json` is no longer read. Config lives in each project now. If you saved `publisher` there, run `termshot config set publisher <name>` in each project that needs it.

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
termshot --run "ls -la" -o /tmp/shot.png       # write to a chosen path
termshot --run "git log --oneline" --cols 80   # use a narrower grid
termshot --run "bun test" --rows 60            # show up to 60 rows
termshot --run "ls" --publish 42               # post the capture to PR 42 (publisher gh)
```

`--run` is required. Without it the run ends with a usage error and exit code 2.

The default output path is `.termshot/captures/<timestamp>.png` inside a project, and `~/termshot/<timestamp>.png` outside one. `<timestamp>` is local time as `YYYYMMDD-HHMMSS-mmm`, for example `20261116-090507-042.png`. A default path never replaces a file: if the name is taken, termshot writes `<timestamp>-1.png`, then `-2`, and so on, and `capture.path` names the file it wrote. A path given with `-o` is replaced if it exists.

## Project config

Each project keeps its own look in `.termshot/config.json`. Commit that file, so everyone on the team gets the same captures.

### Where the config lives

- The project root is the nearest folder, from the current folder upwards, that holds a `.termshot/` folder. Failing that, it is the git top level.
- Reading the config and `termshot config set` use the same rule, so `set` writes where later runs read.
- Outside any project, a capture uses the defaults, creates nothing, and writes to `~/termshot/<timestamp>.png`.
- `termshot config set` creates `.termshot/` in the project root or, outside a project, in the current folder. A capture without `-o` inside a project creates it too, to hold `captures/`. When termshot makes the folder, it also writes `.termshot/.gitignore` with `captures/` in it, so captures stay out of git. `termshot config unset` never creates the folder.

### Config commands

| Command | What it does |
|---------|--------------|
| `termshot config` | Print the effective config and its file path as one JSON line |
| `termshot config set <key> <value>` | Save a value |
| `termshot config unset <key>` | Revert a key to its default |

| Key | Values | Default |
|-----|--------|---------|
| `shell` | `zsh`, `bash`, `sh` | `zsh` |
| `theme` | `dark`, `light` | `dark` |
| `font.size` | Whole number from 10 to 48, in pixels before the 2x render scale | `18` |
| `cols` | Whole number from 1 to 1000 | `120` |
| `rows` | Whole number from 1 to 1000. The most rows shown; the image is cut to the rows actually used | `30` |
| `prompt.show` | `true`, `false` | `true` |
| `prompt.directory` | `full`, `short` (last folder only), `none` | `full` |
| `prompt.git` | `true`, `false` | `true` |
| `prompt.symbol` | Any text of 1 to 4 characters | `❯` |
| `publisher` | `rclone`, `gh` | `rclone` |

Dotted keys are stored nested: `font.size` is `{"font":{"size":18}}` in the file. An unknown key or a bad value in the file stops every run with a `usage-error` at step `config` that names the file.

### Examples

```sh
termshot config set shell bash               # run commands in bash
termshot config set theme light              # light background
termshot config set font.size 22             # bigger text
termshot config set prompt.directory short   # show only the last folder
termshot config set prompt.git false         # hide the git branch
termshot config set prompt.symbol '$'        # a classic prompt
termshot config set prompt.show false        # show only the command, no prompt
```

The default prompt looks like `~/tools/termshot on main ❯ bun test`: the folder with your home shortened to `~`, the git branch when there is one, the symbol, then the command with syntax highlighting.

## Options

| Flag | What it does | Default |
|------|--------------|---------|
| `--run <command>` | Run the command in the headless terminal and render it | required |
| `-o, --output <path>` | Output PNG path | `.termshot/captures/<timestamp>.png` in a project, else `~/termshot/<timestamp>.png` |
| `--cols <n>` | Terminal width in columns | the `cols` config value |
| `--rows <n>` | Most terminal rows shown | the `rows` config value |
| `--publish <dest>` | Upload the PNG publicly and put a Markdown embed in the record. See [Publishing](#publishing) | none |
| `--publisher <name>` | Publisher for this run only: `rclone` or `gh`. Needs `--publish` | the `publisher` config value |
| `--publish-size <px>` | Long edge width for the embed. `rclone` only | `2560` |
| `--publish-label <text>` | Alt text for the embed | the output PNG path |
| `-h, --help` | Show help | |
| `-v, --version` | Show version | |

`--cols` and `--rows` each take a whole number from 1 to 1000, the same range as the config keys. `--publish-size` takes a positive whole number. Flags beat the config for the run.

That table is the whole flag set, plus the `config` command above. Anything else ends the run with exit code 2.

These ten flags were removed and report that they were removed: `--annotate`, `--copy`, `--window-pick`, `--box`, `--marker`, `--list`, `--window`, `--stdout`, `--terminal` and `--settle`.

## Output

Every run prints one JSON line on stdout, success or failure.

Real record from `termshot --run "echo hi" -o /tmp/ts-demo.png` on this machine:

```json
{"tool":"termshot","version":"0.7.0","status":"ok","exitCode":0,"command":{"argv":["echo hi"],"exitStatus":0,"durationMs":17,"timedOut":false},"capture":{"path":"/tmp/ts-demo.png","bytes":15069,"width":2720,"height":236,"sha256":"4b1db65ffc4d259455345ede89afb8577f377d19841b7245126c1da07eb91166"},"terminal":{"shell":"zsh","cols":120,"rows":2},"publish":{"requested":false,"publisher":null,"url":null,"markdown":null,"verified":false},"errors":[]}
```

Notes on that record:

- `capture.path` is the `-o` path as given, and `sha256` is the hash of the written PNG. `width` and `height` are the real pixel size.
- The `terminal` block names the `shell` the command ran in, set even when the run fails. `cols` is the width used. `rows` is the number of rows actually rendered. It is often less than the `rows` asked for. It can be more when the command itself wraps onto more lines than that, because the prompt and command lines are always kept. Both are `null` when nothing was rendered.
- stderr carries the human lines: one per entry in `errors`, then `termshot: wrote <path> (<n> bytes)` when a file was written.

## Exit codes

| Code | Status | Meaning |
|------|--------|---------|
| 0 | `ok` | The PNG was written and the command succeeded |
| 1 | `command-failed` | The PNG was written and the command exited non zero |
| 2 | `usage-error` | Bad or missing flags, or a bad config file. Nothing ran |
| 3 | `environment-error` | The shell is missing, the terminal could not start, termshot was interrupted, or the output folder could not be written. Also when `termshot config set` cannot write the config file |
| 4 | `timeout` | The command did not finish in 60 seconds |
| 5 | `truncated` | Reserved. No run produces this code |
| 6 | `publish-failed` | The PNG was written but the upload failed |
| 7 | `internal-error` | Rendering failed and no PNG was written, or the PNG header could not be read back |

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

A bad `<dest>` for the chosen publisher fails with `usage-error` before the command runs.

## How a headless run works

- termshot runs the command as `<shell> -c <command>` in a pseudo-terminal of `cols` by `rows`, in the current folder. Programs see a real terminal, so they keep their colors and layout.
- The command gets your environment plus `TERM=xterm-256color`, `COLORTERM=truecolor`, `FORCE_COLOR=1`, `CLICOLOR_FORCE=1`, `COLUMNS` and `LINES`, so tools print color even though nobody is watching.
- Pagers are turned off with `PAGER=cat`, `GIT_PAGER=cat` and `MANPAGER=cat`, so `git log` or `man` cannot wait for a key.
- termshot sends one end-of-file on stdin right after the start, so a command that reads stdin gets nothing and moves on.
- The output goes through a terminal emulator in memory. The image shows the prompt line and the highlighted command at the top, then the output exactly as the terminal drew it. termshot never rewrites or recolors the output.
- When the output is taller than `rows`, the prompt line stays at the top and the last lines of output show below it, as a terminal would after scrolling.
- The image is rendered at 2x with the bundled JetBrains Mono font. The cursor is never drawn.
- If you interrupt termshot with Ctrl-C or `SIGTERM`, it kills the command and stops. It renders, writes and publishes nothing. The record shows `environment-error` at step `command-run` with the message `interrupted by SIGINT` (or `SIGTERM`), and `command.exitStatus` is `null`. termshot exits `3`.

## Limits

- The command must finish by itself within 60 seconds. The limit is not configurable.
- The command must not be interactive. A command that reads stdin twice, like `cat; cat`, waits until the timeout, because termshot sends only one end-of-file.
- Characters missing from the bundled font, such as emoji and CJK, draw as an empty box.
- A full-screen program still on its alternate screen when it exits shows only its last screen. A screen clear shows only what came after it.
- Output over 10000 lines keeps only the last 10000.
- An image over 2^28 pixels (about 268 million) is not drawn. The run fails with `internal-error` at step `rendering` and the message `image too large: <w>x<h> px; lower rows or font.size`. At the default `font.size` this takes both a large `cols` and a large `rows`.
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
