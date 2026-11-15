---
name: termshot
description: Screenshot a terminal command to a PNG on macOS and get a JSON record with its path and sha256. Use for terminal evidence (PR screenshots of tests, builds, logs, CLI demos) or when asked to "termshot" or "capture this command". Not for web pages or app UI.
license: MIT
compatibility: macOS only. Needs `termshot` on PATH, Ghostty or Alacritty in /Applications, and Screen Recording permission for the calling terminal.
metadata:
  author: Fayez Nazzal
  version: "0.6.1"
---

# termshot

Runs one command in a fresh terminal window, saves a PNG of it, and prints one JSON line on stdout.

## Capture

```sh
termshot --run "bun test" -o /tmp/evidence.png > /tmp/evidence.json
jq -r '.status, .command.exitStatus, .capture.path' /tmp/evidence.json
```

- Pass an absolute `-o` path. The record echoes it back as given.
- `--cols <n> --rows <n>` sets the grid (default 120x30).
- The command must finish by itself within 60 seconds.
- For a failing exit, use `--run "sh -c 'exit 3'"`. A bare trailing `exit` kills the wrapper and the run times out.

## Read the result

- `status` is the run verdict. `ok` and `command-failed` both mean the PNG was written.
- `command.exitStatus` is the captured command's exit status. `exitCode` is termshot's own exit code. Judge the command by `command.exitStatus`.
- `capture.path`, `capture.sha256` describe the PNG.
- `terminal.emulator` is the terminal used.
- On failure, `errors[]` holds `{step, message}`.

## Publish

Only when the user asks to upload or post the screenshot, add `--publish <dest>`. The dest format depends on their `publisher` config: a PR number, URL or branch for `gh` (posts the image as a PR comment), or `remote:path` for `rclone`. Report `publish.url` when `publish.verified` is `true`.

## When it fails

- `environment-error`, step `terminal-session`, "is not installed": the configured terminal is missing. Retry once with `--terminal ghostty` or `--terminal alacritty`, and tell the user. Leave their config as is.
- `environment-error`, step `screen-capture`: Screen Recording permission is missing. Ask the user to grant it in System Settings, Privacy & Security, Screen Recording, then restart their terminal.
- `usage-error`, step `config`: their config file is invalid. Show them the message.
- `timeout`: the command ran past 60 seconds or ended in `exit`.
- `publish-failed`: the PNG is still on disk; the upload failed. Show the user the message.

## Report

Tell the user the PNG path, the `status`, and the command's exit status in plain words. Add the `sha256` only when proving the file is unchanged. Work from the JSON line alone; leave the PNG unopened.
