# termshot reference

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
- If you interrupt termshot with Ctrl-C or `SIGTERM` while the command is running, it kills the command and stops. It renders, writes and publishes nothing. The record shows `environment-error` at step `command-run` with the message `interrupted by SIGINT` (or `SIGTERM`), and `command.exitStatus` is `null`. termshot exits `3`.

## Limits

- The command must finish by itself within 60 seconds. The limit is not configurable.
- The command must not be interactive. A command that reads stdin twice, like `cat; cat`, waits until the timeout, because termshot sends only one end-of-file.
- Characters missing from the bundled font, such as emoji and CJK, draw as an empty box.
- A full-screen program still on its alternate screen when it exits shows only its last screen. A screen clear shows only what came after it.
- Output over 10000 lines keeps only the last 10000.
- An image over 2^28 pixels (about 268 million) is not drawn. The run fails with `internal-error` at step `rendering` and the message `image too large: <w>x<h> px; lower rows or font.size`. At the default `font.size` this takes both a large `cols` and a large `rows`.
- `--version` prints the `version` field from `package.json`.
