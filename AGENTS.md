# AGENTS.md

`termshot` is built to be called by an AI coding agent. It runs one command in a built-in headless terminal, renders it to a PNG, and prints one JSON line describing the run. Nothing shows on screen and no permission is needed. The reason to call it instead of piping output into a log is that JSON line. It carries `capture.path`, `capture.bytes` and `capture.sha256`, so you can prove a terminal artifact exists and is the exact one you just made, without ever loading the image into your context. `README.md` documents what every flag and config key does. This file documents the order to do things in.

## Golden rules

- Never open, read or base64 the PNG. Read the JSON line instead.
- Always parse the single stdout line. Every run prints exactly one JSON line, success or failure.
- Always pass an absolute path to `-o`. `capture.path` echoes back whatever you passed, so a relative `-o` gives you a relative path in the record. Without `-o`, a capture inside a project creates `.termshot/captures/` in the project root.
- Never confuse the two exit codes. The process exit code of `termshot` is `exitCode` in the JSON. The exit status of the command you captured is `command.exitStatus`. They are different numbers with different meanings.
- Redirect stdout to a file and read fields out of it. Do not paste the whole record into your report.
- Run the preflight recipe before the first capture, not after a confusing failure.
- Never change the user's `.termshot/config.json` to make a capture work. Use `--cols` or `--rows` for the one run, and tell the user.
- Never run an interactive command. The command has to finish on its own within 60 seconds. termshot sends one end-of-file on stdin, so a command that reads stdin more than once waits until the timeout.
- Run `bun run build` after a fresh clone. `bin` points at `dist/termshot`, which is build output and is not committed.
- Report paths and verdicts. Never report raw bytes.

## Recipes

### Prove an artifact exists and is the one you just made

```sh
termshot --run "bun test" -o /tmp/evidence.png > /tmp/evidence.json
jq -r '.status, .command.exitStatus, .capture.path, .capture.sha256' /tmp/evidence.json
shasum -a 256 "$(jq -r .capture.path /tmp/evidence.json)"
```

Proves the PNG is on disk and that its hash matches the hash `termshot` recorded. Ran it in this repo. `jq` printed `ok`, `0`, `/tmp/evidence.png` and the hash, and the `shasum` output matched `capture.sha256` exactly. The test run took about 2 seconds.

### Capture a command you expect to fail

```sh
termshot --run "ls /definitely-not-here" -o /tmp/failure.png
echo "termshot exit: $?"
```

Proves a failing command still produces a PNG. The run above wrote a 29684 byte PNG, set `status` to `command-failed`, set `command.exitStatus` to `1`, and exited `1`. Ran it.

A trailing `exit` works the same way. `termshot --run "exit 3"` finished in 14 ms with `status` `command-failed` and `command.exitStatus` `3`. Ran it.

### Preflight the machine before capturing anything

```sh
termshot --version
termshot config | jq -r '.configPath, .config.shell'
termshot --run "echo preflight" -o /tmp/preflight.png > /tmp/preflight.json
jq -r '.status, .terminal.shell' /tmp/preflight.json
```

Proves `termshot` is on `PATH`, shows which config file applies and which shell is configured, and proves that shell runs and the PNG renders. Ran it from inside this repo. It printed `0.7.0`, then the repo's `.termshot/config.json` path and `zsh`, then `ok` and `zsh`. `termshot config` only reads; the config file need not exist. If the shell is missing, `status` is `environment-error` at step `shell` and the message names the shell and the config key to change.

### Capture with a specific terminal grid

```sh
termshot --run "seq 1 40" --cols 60 --rows 12 -o /tmp/small.png > /tmp/small.json
jq -c .terminal /tmp/small.json
```

Proves the `terminal` block reports the shell used and the grid actually rendered. Ran it, and `jq` printed `{"shell":"zsh","cols":60,"rows":12}`. `rows` is the visible height rendered, capped at `--rows`. The same run with `echo hi` reports `rows` of `2`: the prompt line and one line of output.

## Reading the output

One JSON line goes to stdout. Human lines go to stderr, one per entry in `errors`, then `termshot: wrote <path> (<n> bytes)` when a file was written.

A real successful record, captured with `termshot --run "echo hi" -o /tmp/ts-demo.png`:

```json
{"tool":"termshot","version":"0.7.0","status":"ok","exitCode":0,"command":{"argv":["echo hi"],"exitStatus":0,"durationMs":17,"timedOut":false},"capture":{"path":"/tmp/ts-demo.png","bytes":15069,"width":2720,"height":236,"sha256":"4b1db65ffc4d259455345ede89afb8577f377d19841b7245126c1da07eb91166"},"terminal":{"shell":"zsh","cols":120,"rows":2},"publish":{"requested":false,"publisher":null,"url":null,"markdown":null,"verified":false},"errors":[]}
```

A real timeout record, from `termshot --run "sleep 70" -o /tmp/ts-timeout.png`. No PNG was written:

```json
{"tool":"termshot","version":"0.7.0","status":"timeout","exitCode":4,"command":{"argv":["sleep 70"],"exitStatus":null,"durationMs":60015,"timedOut":true},"capture":{"path":null,"bytes":null,"width":null,"height":null,"sha256":null},"terminal":{"shell":"zsh","cols":null,"rows":null},"publish":{"requested":false,"publisher":null,"url":null,"markdown":null,"verified":false},"errors":[{"step":"command-run","message":"command did not finish within 60000ms"}]}
```

Fields worth asserting on.

| Field | What it tells you |
|-------|-------------------|
| `status` | The verdict for the whole run |
| `exitCode` | The process exit code of `termshot`, mirrored into the JSON |
| `command.exitStatus` | The exit status of the captured command, or `null` when it never finished |
| `command.timedOut` | `true` only when the command ran past 60 seconds |
| `capture.path` | Where the PNG was written, exactly as you passed it, or `null` |
| `capture.sha256` | Hash of the written PNG bytes |
| `capture.bytes` | Size of the written PNG |
| `terminal.shell` | Which shell ran the command, `zsh`, `bash` or `sh`. Set even on failure |
| `terminal.cols` and `terminal.rows` | The width used and the visible height actually rendered, or `null` when nothing was rendered |
| `publish.publisher` | `rclone` or `gh` when `--publish` was passed, else `null` |
| `publish.url`, `publish.markdown` and `publish.verified` | The uploaded image URL, its Markdown embed, and whether the upload was confirmed. Only meaningful when `--publish` was passed |
| `errors[]` | Objects with a `step` and a `message` |

Exit codes, from `src/run-result/exit-codes.ts`.

| Code | Status | Meaning |
|------|--------|---------|
| 0 | `ok` | The PNG was written and the command succeeded |
| 1 | `command-failed` | The PNG was written and the command exited non zero |
| 2 | `usage-error` | Bad or missing flags, or a bad config file. Nothing ran |
| 3 | `environment-error` | The shell is missing (step `shell`), the terminal could not start (step `command-run`), or the output folder or file could not be written (step `artifact`). Also when `termshot config set` cannot write the config file (step `config`) |
| 4 | `timeout` | The command did not finish in 60 seconds. No PNG was written |
| 5 | `truncated` | Reserved. No run produces this code |
| 6 | `publish-failed` | The PNG was written but the upload failed |
| 7 | `internal-error` | Rendering failed and no PNG was written (step `rendering` or `terminal-emulation`), or the PNG header could not be read back (step `artifact`) |

Exit code `1` still means you have a good PNG. Treat it as success for evidence, and report the command failure separately.

## Pitfalls

| Symptom | Cause | Fix |
|---------|-------|-----|
| `capture.path` is a bare file name | `-o` was given a relative path, and the record echoes it back unchanged | Always pass an absolute path to `-o` |
| You report the command as passing when it failed | `exitCode` was read instead of `command.exitStatus` | Assert on `command.exitStatus` for the command, and on `exitCode` for the tool |
| `status` is `environment-error` at step `shell` saying the shell `was not found on PATH` | The configured shell is not installed or not on `PATH` | Tell the user. They can install it or pick another with `termshot config set shell <name>` |
| `status` is `internal-error` at step `rendering` | The frame could not be drawn, so no PNG was written | Re-run once. If it fails again, report the message to the user |
| `status` is `timeout` on a command that reads stdin | termshot sends one end-of-file, and the command waits for more input, as `cat; cat` does | Feed the input from a file or a pipe inside `--run`, for example `--run "sort < /tmp/input.txt"` |
| `status` is `command-failed` with `command.exitStatus` `137` | termshot got `SIGINT` or `SIGTERM` and killed the command. The PNG shows what it printed so far | Re-run without interrupting it |
| The PNG shows only part of the output | Output over 10000 lines keeps only the last 10000. A screen clear keeps only what came after it. A full-screen program still on its alternate screen at exit shows only its last screen | Capture a shorter command, or one that does not clear the screen |
| Emoji or CJK text draws as blank space in the PNG | The bundled font has no glyph for those characters | Expected. Nothing to fix |
| `status` is `usage-error` at step `flags` saying `--publish dest for <publisher> must look like` | The destination does not fit the configured publisher | Use the format in the message: `remote:path` for `rclone`, a PR number, URL or branch for `gh` |
| `status` is `usage-error` at step `config` naming `config.json` | The project config file has an unknown key or value | Ask the user to fix it with `termshot config set` or `termshot config unset` |
| `status` is `usage-error` saying a flag `was removed` | One of `--annotate`, `--copy`, `--window-pick`, `--box`, `--marker`, `--list`, `--window`, `--stdout`, `--terminal` or `--settle` was passed, all removed | Drop the flag. Check the flag table in `README.md` |
| `termshot: command not found` right after cloning | `bin` points at `dist/termshot`, which is not committed | Run `bun run build`, then `bun link` |

## Reporting

Tell your user this, and nothing more.

- The absolute path of the PNG.
- The verdict, taken from `status`.
- The exit status of the captured command, taken from `command.exitStatus`, said in plain words.
- The `sha256` only when the point is proving the file is unchanged.
- The published URL when `--publish` was used and `publish.verified` is `true`.

Never paste the image, the base64, or the whole JSON record.
