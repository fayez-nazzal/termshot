---
name: termshot
description: Runs one shell command in a fresh Ghostty window on macOS, captures that window to a PNG, and prints one JSON line with the path, byte size and sha256 of the image. Use when you need visual proof that a terminal command ran, such as PR evidence, a screenshot of a test run, build output, a log or a CLI demo. Triggers on "screenshot the terminal", "capture this command", "termshot", "show the test output as an image", "attach terminal evidence to the PR", "prove this command passed", "grab a PNG of the build log". Also use when a task asks for before and after terminal evidence, or when a reviewer needs to see command output without running it. Do not use for web pages or rendered UI, use a browser capture tool for those.
license: MIT
compatibility: macOS only. Needs Ghostty at `/Applications/Ghostty.app` and Screen Recording permission for the calling terminal. Needs `termshot` on `PATH`.
metadata:
  author: Fayez Nazzal
  version: "0.6.0"
---

# termshot

Runs a command in a fresh Ghostty window, captures the window to a PNG, and prints one JSON line describing the run.

## When to use

- You need PNG evidence of a command, test run, build or log for a PR.
- You need to prove an artifact exists and is the exact file you just made.
- You need before and after terminal evidence for a change.
- The subject is a terminal. Rendered pages and app UI go to a browser capture tool.

## Check first

Run this once before the first capture.

```sh
sw_vers -productVersion
ls /Applications/Ghostty.app/Contents/MacOS/ghostty
termshot --run "echo preflight" -o /tmp/preflight.png > /tmp/preflight.json
jq -r .status /tmp/preflight.json
```

- `jq` must print `ok`.
- `environment-error` at step `screen-capture` means Screen Recording permission is missing. Grant it under `System Settings` then `Privacy & Security` then `Screen Recording`, then restart the calling terminal.
- `termshot: command not found` after a fresh clone means `dist/termshot` is not built. Run `bun run build` then `bun link`.

## Core recipe

```sh
termshot --run "bun test" -o /tmp/evidence.png > /tmp/evidence.json
jq -r '.status, .command.exitStatus, .capture.path, .capture.sha256' /tmp/evidence.json
shasum -a 256 "$(jq -r .capture.path /tmp/evidence.json)"
```

Assert on this.

- `status` is `ok` or `command-failed`.
- `capture.path` is the absolute path you passed.
- The `shasum` output matches `capture.sha256`.

Add `--cols 60 --rows 12` to pick the terminal grid. The `terminal` block reports the grid the window really used.

## Reading the result

Stdout is exactly one JSON line, on success and on failure. Human lines go to stderr.

- `status` is the verdict for the whole run.
- `exitCode` is the exit code of `termshot` itself.
- `command.exitStatus` is the exit status of the command you captured. It is a different number from `exitCode`.
- `capture.path`, `capture.bytes` and `capture.sha256` describe the PNG, or are `null` when none was written.
- `errors[]` holds objects with a `step` and a `message`.

Exit codes worth branching on.

- `0` `ok`. PNG written, command passed.
- `1` `command-failed`. PNG written, command exited non zero. Still good evidence.
- `2` `usage-error`. Bad flags, nothing ran.
- `3` `environment-error`. Ghostty, the window or `screencapture` failed.
- `4` `timeout`. The command did not finish in 60 seconds.
- `6` `publish-failed`. PNG written, upload failed.
- `7` `internal-error`. PNG written, header could not be read back.

## Rules

- Never open, read or base64 the PNG. Read the JSON line instead.
- Always pass an absolute path to `-o`. The record echoes back whatever you passed.
- Never end the command with `exit`. It kills the wrapper shell and the run times out. Use `--run "sh -c 'exit 3'"` instead.
- Never run an interactive command. It has to finish on its own.
- Read `command.exitStatus` for the command verdict and `exitCode` for the tool verdict. Mixing them reports a failing command as passing.
- Report the path, the verdict and the command exit status in plain words. Never paste the image, the base64 or the whole record.

Full recipes and the complete pitfall table live in `AGENTS.md` at the repo root.
