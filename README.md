# termshot

Run a command in a headless terminal and save its output as a PNG. Each capture prints one JSON line with the command’s exit status, the image path, and its SHA-256 hash. Use it to share terminal output in pull requests, issues, or docs.

## Install on macOS

```sh
brew install fayez-nazzal/tap/termshot-cap
```

The formula is called `termshot-cap`. The command is `termshot`.

If you installed an earlier version from the tap, run `brew update` and `brew upgrade termshot-cap`. Version 0.7 captures in the background without Ghostty or Screen Recording permission. It reads settings from `.termshot/config.json` in your project.

## Capture a command

```sh
termshot --run "git log -5 --oneline" -o /tmp/git-log.png
```

Leave out `-o` to save under `.termshot/captures/` in your project or `~/termshot/` outside one. Use commands that finish on their own within 60 seconds. A command that exits with an error can still produce a PNG.

- See the [command and configuration reference](docs/reference.md) for options, exit codes, and publishing to GitHub or Google Drive.
- See [AGENTS.md](AGENTS.md) for capture recipes and the [agent skill](skills/termshot/SKILL.md) for agent setup. Install the skill with `bash scripts/install-skill.sh` from a clone.

## Build from source

With [Bun](https://bun.sh) installed, run `bun install`, `bun run build`, and `bun test`. Run `./dist/termshot --help` to try the compiled CLI.

[Contributing](CONTRIBUTING.md) · [MIT license](LICENSE)
