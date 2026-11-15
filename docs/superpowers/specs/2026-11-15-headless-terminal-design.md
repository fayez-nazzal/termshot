# termshot headless terminal: design

Date: 2026-11-15
Status: draft, awaiting approval
Target version: 0.7.0 (breaking)

## Intent

termshot currently opens a real Ghostty or Alacritty window, waits for it, and grabs it with macOS `screencapture`. That steals focus, needs one of those apps installed, needs Screen Recording permission, and ties the look to whatever the user's terminal happens to be.

Replace all of that with a terminal that ships inside termshot and never draws on screen. termshot runs the command itself, emulates the terminal in memory, and renders the PNG directly. The result should look good by default: a large, clear font, a clean prompt, the command syntax-highlighted as if typed, then the command's real output.

Each project configures its own look in `.termshot/config.json`, edited with `termshot config set`, the same way browsershot uses `.browsershot/config.json`.

## Goals

- Nothing appears on screen. No window, no focus change, no permission prompt.
- Nothing to install beyond termshot. Terminal emulator, renderer and font are all inside the `dist/termshot` binary.
- Good-looking defaults. Large monospace font, rendered at 2x for sharpness. A prompt showing the directory and git branch. The command highlighted. The output keeps its own ANSI colors.
- Per-project config in `.termshot/config.json` is the only source of truth, edited with `termshot config set|unset`.
- Each concern sits behind a port with swappable adapters (shell, prompt, highlighter, emulator, renderer, theme, publisher), so any of them can change later without touching the others.
- Docs, skill, package metadata and tests are all consistent, and nothing still mentions Ghostty, Alacritty, windows, `screencapture` or Screen Recording.

## Non-goals

- Starship or any external prompt program. The prompt port makes adding one later a single adapter, but not now.
- Fake window chrome (traffic lights, title bar).
- Interactive or long-running commands. The command must finish by itself within 60 seconds, as today.
- Windows support. macOS is the target. Linux should work as a side effect and CI will exercise it, but it isn't promised in docs.
- Migrating the old global `~/.config/termshot/config.json`. It is ignored from now on.

## Anti-goals

- Anything visible on the user's screen during a capture.
- Needing network access at runtime, or downloading anything on first run.
- Changing what the command printed. termshot adds the prompt line above the output. It never rewrites, reflows or recolors the output itself.
- Vendor names leaking out of their adapter folder (`xterm`, `resvg`, `zsh` and the like). The architecture test enforces this.

## Approaches considered

- **A. Built-in terminal renders the PNG (chosen).** The command runs under the configured shell in a pseudo-terminal (`Bun.Terminal`, built into Bun 1.4). The output goes into `@xterm/headless`. The resulting cell grid becomes SVG, and `@resvg/resvg-wasm` rasterizes it to PNG with a font embedded in the binary. Fully bundled, nothing shown on screen, and the look is under our control. The cost is two runtime dependencies plus a font file, where today there are none.
- **B. Off-screen browser screenshot.** Render HTML and capture it with headless Chrome. Rejected because it needs Chrome installed.
- **C. External renderer (`freeze`, `vhs`).** Rejected because it's an install dependency and we wouldn't control the look.
- **D. Our own font rasterizer, no dependencies.** Rejected: a lot of fiddly anti-aliasing code for no real gain over A.

The user picked A.

## Decisions made with the user

- Ghostty and Alacritty support is removed. This is a breaking change, and that's accepted.
- No starship, neither bundled nor used from the machine. termshot draws its own prompt.
- The default shell is zsh. The shell and prompt options can be configured per project.
- The source of truth is per-project config under `.termshot/`, modeled on browsershot.

## Design

### Pipeline

```
config (.termshot/config.json) ─┐
flags (--run, -o, --cols, --rows, --publish...) ─┤
                                 ▼
 shell adapter ──► PTY run (Bun.Terminal) ──► bytes ──► emulator (xterm headless) ──► cell grid
                                                                                        │
 prompt adapter ──► prompt segments ─┐                                                  │
 highlighter ──► command tokens ─────┴──► frame = prompt line + command + output grid ◄─┘
                                                     │
                              theme + font ──► renderer (SVG → resvg) ──► PNG bytes
                                                     │
                                         artifact (write, sha256) ──► publisher (optional) ──► JSON record
```

### Domains (folders under `src/`)

Each domain owns a port (an interface) and a registry of adapters, following the pattern `src/publishing/` already uses (`registry.ts` + `<vendor>.ts`). A vendor name may only appear inside its own domain folder.

| Domain | Port | Default adapter | Notes |
|---|---|---|---|
| `shell/` | `Shell`: builds the argv that runs a command string non-interactively | `zsh` (also `bash`, `sh`) | Runs `<shell> -c <command>`. No rc files beyond what the shell reads for `-c` (zsh reads `.zshenv` only). |
| `command-run/` | `CommandRunner`: run argv in a PTY of `cols`×`rows`, return the output bytes, exit status, duration and whether it timed out | `Bun.Terminal` | Reads the exit status straight from the process. The status file, poller and `inner-script.ts` go away, and so does the trailing-`exit` pitfall. 60 s timeout kept. Stdin stays the PTY (so `isatty` is true and tools keep color), and termshot sends EOF on it right after start so nothing waits for input. |
| `terminal-emulation/` | `TerminalEmulator`: feed bytes, read back a grid of cells (char, fg, bg, bold, italic, underline, inverse, wide) | `@xterm/headless` | Scrollback large enough to hold all output. |
| `prompt/` | `Prompt`: given context (cwd, home, git branch), return styled segments | `default` | See Prompt below. |
| `highlighting/` | `Highlighter`: command string → tokens tagged with a role (command, argument, flag, string, variable, operator, comment, path) | `shell` (small tokenizer we write) | Roles, not colors. The theme maps roles to colors. |
| `theme/` | `Theme`: background, foreground, 16 ANSI colors, cursor, prompt colors, highlight role colors | `dark` (default), `light` | Our own palette, chosen for contrast. |
| `rendering/` | `Renderer`: frame + theme + font → PNG bytes | `svg` (builds SVG, rasterizes with resvg-wasm) | Owns the embedded font and the wasm. |
| `artifact/` | write PNG, sha256, PNG header read | renamed from `screen-capture/` with `screencapture` code deleted | |
| `publishing/` | unchanged | `rclone` | |
| `configuration/` | settings registry, project config store | | See Config below. |
| `invocation/`, `run-result/` | flags, help, JSON record | | Updated for the new flags and record. |

Removed entirely: `terminal-emulator/` (the Ghostty and Alacritty adapters), `terminal-session/` (window lookup and signal-safe disposal of terminal apps), `screen-capture/screen-capture.ts`, `command-run/inner-script.ts`, `command-run/exit-status.ts`, `command-run/completion.ts`, and their tests. On timeout or a signal, the runner still has to kill the child process. That small piece of signal-safe disposal moves into `command-run/`.

`run.ts` keeps its role as the orchestrator over ports, so it stays unit-testable with fakes as it is today. The new ports are shell, runner, emulator, prompt, highlighter, renderer, artifacts, clock and publisher.

### The frame

- Line 1 holds the prompt segments followed by the highlighted command. A command longer than the width wraps the way a terminal would.
- Below that is the emulator's grid of the command's output, exactly as rendered.
- Width is fixed to `cols` columns, so captures from one project line up.
- Height fits the content: the prompt line plus the output lines actually used, with trailing blank lines trimmed. It is capped at `rows`. `rows` is the visible height, not a forced height.
- The prompt and command line are always pinned at the top. When the output is taller than the space left, the last lines of output show below them, as a terminal would after scrolling. *(Builder-check call: the command must stay visible in evidence screenshots.)*
- Padding goes around the grid. The background is one solid color with rounded corners.
- The cursor is never drawn.

### Prompt (default adapter)

- `~/tools/termshot on main ❯ bun test` is the default look.
- Directory: the path with `$HOME` collapsed to `~`. `prompt.directory` can be `full` (the default), `short` (the last folder only) or `none`.
- Git: ` on <branch>` when cwd is inside a git repo. It's found by running `git` if it's on PATH, and skipped silently if not. Set `prompt.git` to false to turn it off.
- Symbol: `prompt.symbol`, default `❯`, in the theme's prompt color.
- Set `prompt.show` to false to drop the prompt and show just the highlighted command.
- No Nerd Font icons, so the bundled font only needs normal Unicode coverage.

### Rendering

- Font: JetBrains Mono (SIL OFL 1.1), Regular, Bold, Italic and Bold Italic, in `assets/fonts/`, with its license file, embedded into the compiled binary.
- `font.size` defaults to 18, in CSS pixels. Output is rendered at 2x, so the PNG is sharp on high-density screens. `capture.width` and `capture.height` report the real pixel size.
- `@resvg/resvg-wasm` is initialized from wasm bytes embedded in the binary. No file is read from disk at runtime.
- Wide characters (CJK, emoji) take two cells. Characters missing from the font fall back to whatever resvg can find, and otherwise draw as a blank box. That's acceptable.

### Command environment

- The command runs in termshot's cwd, with the caller's environment plus `TERM=xterm-256color`, `COLORTERM=truecolor`, `FORCE_COLOR=1`, `CLICOLOR_FORCE=1`, `COLUMNS` and `LINES`, so tools emit color even though nobody is watching.
- Pagers are disabled so commands like `git log` or `man` can't hang waiting for keys: `PAGER=cat`, `GIT_PAGER=cat`, `MANPAGER=cat`. This changes which program pages the output, not the output itself. *(Builder-check call.)*
- Shell: `shell` from config. If the shell's executable isn't found, the run fails with `environment-error` at step `shell`, and the message names the shell and the config key to change.

### Config

- **Location.** `.termshot/config.json` under the project root. The project root is the nearest ancestor of cwd, cwd included, that contains a `.termshot/` folder. Failing that, it's the git top-level. Reading and `config set` use the same rule, so `set` writes where later runs read.
- **Outside any project** (no `.termshot/` above cwd and not in a git repo): a capture creates nothing. It uses the defaults and writes to `~/termshot/<timestamp>.png`. Only `config set` creates `.termshot/`, in cwd. *(Builder-check call: an agent running from `~` or `/tmp` shouldn't leave folders behind.)*
- **`.termshot/.gitignore`** is created with `captures/` in it the first time the folder is made. `config.json` is meant to be committed, so the team shares one look.
- **Default output path.** `.termshot/captures/<timestamp>.png`, replacing `~/termshot/<timestamp>.png`.
- **Keys.** Dotted names map to nested JSON: `font.size` is stored as `{"font":{"size":18}}`. Each domain contributes its own settings (default, description, parser) to one registry in `configuration/`, the same way `CONFIG_KEYS` works today. Unknown keys or bad values are a `usage-error` at step `config`.

| Key | Default | Values |
|---|---|---|
| `shell` | `zsh` | `zsh`, `bash`, `sh` |
| `theme` | `dark` | `dark`, `light` |
| `font.size` | `18` | integer 10–48 |
| `cols` | `120` | positive integer |
| `rows` | `30` | positive integer |
| `prompt.show` | `true` | `true`, `false` |
| `prompt.directory` | `full` | `full`, `short`, `none` |
| `prompt.git` | `true` | `true`, `false` |
| `prompt.symbol` | `❯` | any non-empty string up to 4 characters |
| `publisher` | `rclone` | `rclone`, `gh` |

- **Commands.** `termshot config` prints one JSON line with `configPath` and the effective config, as today. `termshot config set <key> <value>` and `termshot config unset <key>` work as now.
- **Flag precedence.** Flags beat config for the run: `--cols`, `--rows`, `--publisher`.
- **Old global config.** `~/.config/termshot/config.json` is no longer read. The README's upgrade note says so, and tells users who saved `publisher` there to run `termshot config set publisher <name>` in each project.

### Flags

- Kept: `--run`, `-o/--output`, `--cols`, `--rows`, `--publish`, `--publish-size`, `--publish-label`, `--publisher`, `-h`, `-v`.
- Removed, and added to `REMOVED_FLAGS` so passing them is a clear `usage-error`: `--terminal` and `--settle`. There is no window to settle and no terminal to pick.

### JSON record

The shape stays the same apart from the `terminal` block:

```json
"terminal": {"shell": "zsh", "cols": 120, "rows": 30}
```

- `emulator` is removed and `shell` is added.
- `rows` is the visible height actually rendered, which can be less than the requested `rows`.
- `cols` and `rows` are `null` when nothing was rendered.

Status and exit codes are unchanged, with these meanings:

- `environment-error` (3): the shell is missing, the PTY could not start, or the output folder could not be written.
- `internal-error` (7): rendering failed or the PNG header could not be read back. When rendering fails, no PNG is written.
- `timeout` (4): the command ran past 60 s. A trailing `exit` no longer causes a timeout.
- `truncated` (5): still reserved and still unused.

### Docs and cleanup

Update every file that mentions the old model to describe only the new one:

- `README.md`
- `AGENTS.md`: re-run every recipe and replace the sample records with real ones. Drop the preflight recipe's terminal and Screen Recording checks, and drop the pitfalls for trailing `exit`, a missing terminal, Screen Recording, the window timeout and tiling window managers.
- `skills/termshot/SKILL.md`: the description, the `compatibility` line ("Needs `termshot` on PATH. macOS."), the failure section and the version.
- `CONTRIBUTING.md`, `SECURITY.md` if it applies, `package.json` (description and keywords: drop `ghostty`, `alacritty`, `screencapture`, add `headless`), `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `.github/ISSUE_TEMPLATE/*`, `src/invocation/help.ts`.

Add a test that fails if any tracked file outside `docs/superpowers/` contains `Ghostty`, `Alacritty`, `screencapture`, `Screen Recording` or `window` in the old sense. The builder chooses the exact word list. Extend `test/architecture.test.ts` so `xterm`, `resvg`, shell names and font names only appear inside their own domain folders.

CI already runs on ubuntu. Install zsh in the workflow (`apt-get install -y zsh`) so the default shell is the one tested. *(Builder-check call.)* Add one end-to-end test that runs the compiled binary on `echo hi` and asserts `status: ok` and a valid PNG header. That's now possible because no GUI is needed.

## Left to the builder

- Exact theme colors. Aim for high contrast and a calm look, and check `ls --color` and `bun test` output in both themes.
- Padding, corner radius and line height.
- The highlighter's token rules. A simple, predictable tokenizer is fine: it's for looks, not parsing correctness.
- How the font and wasm get embedded with `bun build --compile` (`import ... with { type: "file" }` or similar). **Spike this first.** It's the biggest technical risk. If wasm embedding fails, the native `@resvg/resvg-js` addon embedded the same way is an acceptable fallback.
- Internal module names inside each domain.
- The exact word list for the stale-reference test.
