# AGENTS.md

`termshot` is built to be called by an AI coding agent. It runs one command in a fresh Ghostty window on macOS, captures that window to a PNG, and prints one JSON line describing the run. The reason to call it instead of piping output into a log is that JSON line. It carries `capture.path`, `capture.bytes` and `capture.sha256`, so you can prove a terminal artifact exists and is the exact one you just made, without ever loading the image into your context. `README.md` documents what every flag does. This file documents the order to do things in.

## Golden rules

- Never open, read or base64 the PNG. Read the JSON line instead.
- Always parse the single stdout line. Every run prints exactly one JSON line, success or failure.
- Always pass an absolute path to `-o`. `capture.path` echoes back whatever you passed, so a relative `-o` gives you a relative path in the record.
- Never confuse the two exit codes. The process exit code of `termshot` is `exitCode` in the JSON. The exit status of the command you captured is `command.exitStatus`. They are different numbers with different meanings.
- Redirect stdout to a file and read fields out of it. Do not paste the whole record into your report.
- Check macOS, Ghostty and Screen Recording permission before the first capture, not after a confusing failure.
- Never run an interactive command. The command has to finish on its own.
- Never end the command with `exit`. That kills the wrapper shell before the exit status is recorded, and the run times out after 60 seconds.
- Run `bun run build` after a fresh clone. `bin` points at `dist/termshot`, which is build output and is not committed.
- Report paths and verdicts. Never report raw bytes.

## Recipes

### Prove an artifact exists and is the one you just made

```sh
termshot --run "bun test" -o /tmp/evidence.png > /tmp/evidence.json
jq -r '.status, .command.exitStatus, .capture.path, .capture.sha256' /tmp/evidence.json
shasum -a 256 "$(jq -r .capture.path /tmp/evidence.json)"
```

Proves the PNG is on disk and that its hash matches the hash `termshot` recorded. Ran it. The `shasum` output matched `capture.sha256` exactly.

### Capture a command you expect to fail

```sh
termshot --run "ls /definitely-not-here" -o /tmp/failure.png
echo "termshot exit: $?"
```

Proves a failing command still produces a PNG. The run above wrote a 49002 byte PNG, set `status` to `command-failed`, set `command.exitStatus` to `1`, and exited `1`. Ran it.

### Preflight the machine before capturing anything

```sh
sw_vers -productVersion
ls /Applications/Ghostty.app/Contents/MacOS/ghostty
termshot --run "echo preflight" -o /tmp/preflight.png > /tmp/preflight.json
jq -r .status /tmp/preflight.json
```

Proves macOS is present, Ghostty is installed, and Screen Recording permission is granted. Ran it, and `jq` printed `ok`. If permission is missing the capture step fails instead, and `status` is `environment-error`.

### Capture with a specific terminal grid

```sh
termshot --run "echo hi" --cols 60 --rows 12 -o /tmp/small.png > /tmp/small.json
jq -c .terminal /tmp/small.json
```

Proves the `terminal` block reports the real grid the window was launched with. Ran it, and `jq` printed `{"cols":60,"rows":12}`.

## Reading the output

One JSON line goes to stdout. Human lines go to stderr, one per entry in `errors`, then `termshot: wrote <path> (<n> bytes)` when a file was written.

A real successful record, captured on macOS 15.7.5 with `termshot --run "echo hi" -o /tmp/ts-demo.png`:

```json
{"tool":"termshot","version":"0.5.2","status":"ok","exitCode":0,"command":{"argv":["echo hi"],"exitStatus":0,"durationMs":0,"timedOut":false},"capture":{"path":"/tmp/ts-demo.png","bytes":42664,"width":1936,"height":1036,"sha256":"544d9884c49949b47a3f78ea9c26679f6c6585cb2c4148f4feb40c3bdb3acad8"},"terminal":{"cols":120,"rows":30},"publish":{"requested":false,"url":null,"markdown":null,"verified":false},"errors":[]}
```

A real timeout record, from `termshot --run "exit 3"`:

```json
{"tool":"termshot","version":"0.5.2","status":"timeout","exitCode":4,"command":{"argv":["exit 3"],"exitStatus":null,"durationMs":60031,"timedOut":true},"capture":{"path":null,"bytes":null,"width":null,"height":null,"sha256":null},"terminal":{"cols":null,"rows":null},"publish":{"requested":false,"url":null,"markdown":null,"verified":false},"errors":[{"step":"command-run","message":"command did not finish within 60000ms"}]}
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
| `terminal.cols` and `terminal.rows` | The real grid the window used, or `null` when no window was captured |
| `publish.url` and `publish.verified` | Only meaningful when `--publish` was passed |
| `errors[]` | Objects with a `step` and a `message` |

Exit codes, from `src/run-result/exit-codes.ts`.

| Code | Status | Meaning |
|------|--------|---------|
| 0 | `ok` | The PNG was written and the command succeeded |
| 1 | `command-failed` | The PNG was written and the command exited non zero |
| 2 | `usage-error` | Bad or missing flags. Nothing ran |
| 3 | `environment-error` | Ghostty, the window or `screencapture` could not do the job |
| 4 | `timeout` | The command did not finish in 60 seconds |
| 5 | `truncated` | Reserved. No run produces this code |
| 6 | `publish-failed` | The PNG was written but the upload failed |
| 7 | `internal-error` | The PNG was written but its header could not be read back |

Exit code `1` still means you have a good PNG. Treat it as success for evidence, and report the command failure separately.

## Pitfalls

| Symptom | Cause | Fix |
|---------|-------|-----|
| `status` is `timeout` after 60 seconds on a command that should be instant | The command ends with `exit`, which kills the wrapper shell before it records the exit status | Wrap it in a child shell. `--run "sh -c 'exit 3'"` finishes in about one second and reports `command.exitStatus` of `3` |
| `capture.path` is a bare file name | `-o` was given a relative path, and the record echoes it back unchanged | Always pass an absolute path to `-o` |
| You report the command as passing when it failed | `exitCode` was read instead of `command.exitStatus` | Assert on `command.exitStatus` for the command, and on `exitCode` for the tool |
| `status` is `environment-error` at step `terminal-session` with an `ENOENT` message about `ghostty` | Ghostty is not installed at `/Applications/Ghostty.app` | Install Ghostty |
| `status` is `environment-error` with `did not open a window within 15000ms` | The window never appeared inside the 15 second budget | Check that Ghostty launches by hand. The budget is not configurable |
| `status` is `environment-error` at step `screen-capture` with a `screencapture failed` message | Screen Recording permission is missing for the calling terminal | Grant it under `System Settings` then `Privacy & Security` then `Screen Recording`, then restart the calling terminal |
| `status` is `usage-error` saying a flag `was removed` | One of `--annotate`, `--copy`, `--window-pick`, `--box`, `--marker`, `--list`, `--window` or `--stdout` was passed | Drop the flag. Check the flag table in `README.md` |
| `termshot: command not found` right after cloning | `bin` points at `dist/termshot`, which is not committed | Run `bun run build`, then `bun link` |
| The window is a size you did not ask for | A tiling window manager is resizing it | Add a rule that floats windows titled `termshot-*` |

## Reporting

Tell your user this, and nothing more.

- The absolute path of the PNG.
- The verdict, taken from `status`.
- The exit status of the captured command, taken from `command.exitStatus`, said in plain words.
- The `sha256` only when the point is proving the file is unchanged.
- The published URL when `--publish` was used and `publish.verified` is `true`.

Never paste the image, the base64, or the whole JSON record.
