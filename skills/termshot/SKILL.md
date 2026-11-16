---
name: termshot
description: Render a terminal command to a PNG in a built-in headless terminal and get a JSON record with its path and sha256. Use for terminal evidence (PR screenshots of tests, builds, logs, CLI demos) or when asked to "termshot" or "capture this command". Not for web pages or app UI.
license: MIT
compatibility: Needs `termshot` on PATH. macOS.
metadata:
  author: Fayez Nazzal
  version: "0.7.0"
---

# termshot

Runs one command in a built-in headless terminal, renders it to a PNG, and prints one JSON line on stdout. Nothing shows on screen.

## Capture

```sh
termshot --run "bun test" -o /tmp/evidence.png > /tmp/evidence.json
jq -r '.status, .command.exitStatus, .capture.path' /tmp/evidence.json
```

- Pass an absolute `-o` path. The record echoes it back as given.
- `--cols <n> --rows <n>` sets the grid for one run (default 120x30). `rows` is the most rows shown.
- The command must finish by itself within 60 seconds. It gets one end-of-file on stdin, so feed input from a file or pipe inside `--run`.

## Read the result

- `status` is the run verdict. `ok` and `command-failed` both mean the PNG was written.
- `command.exitStatus` is the captured command's exit status. `exitCode` is termshot's own exit code. Judge the command by `command.exitStatus`.
- `capture.path`, `capture.sha256` describe the PNG.
- `terminal.shell` is the shell used. `terminal.rows` is the number of rows actually rendered; a very long command that wraps can make it larger than `--rows`.
- On failure, `errors[]` holds `{step, message}`.

## Publish

Only when the user asks to upload or post the screenshot, add `--publish <dest>`. The dest format depends on their `publisher` config: a PR number, URL or branch for `gh` (posts the image as a PR comment), or `remote:path` for `rclone`. Report `publish.url` when `publish.verified` is `true`.

## When it fails

- `environment-error`, step `shell`, "was not found on PATH": the configured shell is missing. Tell the user. They can install it or run `termshot config set shell <name>`. Leave their config as is.
- `environment-error`, step `command-run` or `artifact`, any other message: the terminal could not start, or the output path could not be written. Check the `-o` folder and show the user the message.
- `internal-error`, step `rendering`: no PNG was written. If the message says "image too large", re-run with a smaller `--rows`. Otherwise re-run once, then show the user the message.
- `usage-error`, step `config`: their `.termshot/config.json` is invalid. Show them the message.
- `timeout`: the command ran past 60 seconds or waited for input. No PNG was written.
- `environment-error`, step `command-run`, "interrupted by SIGINT" (or `SIGTERM`): termshot was stopped and killed the command. No PNG was written. Re-run it without interrupting.
- `publish-failed`: the PNG is still on disk; the upload failed. Show the user the message.

## Report

Tell the user the PNG path, the `status`, and the command's exit status in plain words. Add the `sha256` only when proving the file is unchanged. Work from the JSON line alone; leave the PNG unopened.
