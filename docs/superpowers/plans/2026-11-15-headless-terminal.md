# Headless Terminal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Ghostty/Alacritty window capture with a built-in headless terminal that runs the command in a PTY, emulates it in memory and renders the PNG directly, configured per project in `.termshot/config.json`.

**Architecture:** One orchestrator (`src/run.ts`) over ports. Each concern is a domain folder under `src/` with a port file, a `registry.ts` and one file per adapter, mirroring `src/publishing/`. Pipeline: shell argv → PTY run (`Bun.Terminal`) → bytes → `@xterm/headless` → cell rows → frame (prompt + highlighted command + output) → SVG → `@resvg/resvg-wasm` → PNG → artifact → optional publish → one JSON line.

**Tech Stack:** Bun 1.4.2 (`Bun.Terminal`, `bun build --compile`, `bun test`), TypeScript, `@xterm/headless@6.0.0`, `@resvg/resvg-wasm@2.6.2`, JetBrains Mono 2.304 (OFL 1.1).

**Spec:** `docs/superpowers/specs/2026-11-15-headless-terminal-design.md`

## Global Constraints

- Target version `0.7.0`, a breaking release.
- Nothing visible on screen during a capture. No network access or downloads at runtime.
- The command's output is never rewritten, reflowed or recolored. termshot only adds the prompt line above it.
- Vendor names (`xterm`, `resvg`, `JetBrains`, shell names `zsh`/`bash`/`sh`, publisher names) appear only inside their own domain folder under `src/`. `test/architecture.test.ts` enforces it.
- Command timeout stays `60000` ms.
- `font.size` default `18`, range 10–48. Rendered at 2x. Cell width `0.6 × font.size`, line height `1.5 × font.size`, padding `32` px, corner radius `14` px (CSS px before the 2x scale).
- Default `cols` `120`, `rows` `30`, `shell` `zsh`, `theme` `dark`, `prompt.symbol` `❯`, `publisher` `rclone`.
- Exit codes unchanged: 0 ok, 1 command-failed, 2 usage-error, 3 environment-error, 4 timeout, 5 truncated (unused), 6 publish-failed, 7 internal-error.
- Domain layout mirrors `src/publishing/`: `<domain>/<noun>.ts` (port + types), `<domain>/registry.ts` (ids, `parse<X>Id`, `default<X>()` or `<x>For(id)`), one file per adapter. Code outside a domain imports only its port file and `registry.ts`.
- `bun test` passes at the end of every task.
- Existing code style: no early returns in the middle of functions (single `result` variable, one `return` at the end), as in `src/run.ts` and `src/invocation/flags.ts`.

## Review Focus

1. **Command that reads stdin** (`cat`, `read x`): finishes at once on the EOF termshot sends, and no `^D` appears in the output. Test in Task 3.
2. **Command that leaves a background child holding the PTY** (`sleep 30 &`): termshot returns soon after the shell exits, not after 30 or 60 seconds. Test in Task 3.
3. **Command that wraps past `rows` lines on its own**: the prompt and full command stay visible, the output gets whatever rows are left (possibly none). Test in Task 8.
4. **Output using `\r` progress updates or screen clears**: the PNG shows the final state a terminal would show, not every intermediate line. Test in Task 4.
5. **XML-special characters and emoji in the command or output** (`<`, `&`, `"`, `🚀`, CJK): the SVG stays valid and a PNG is produced. Test in Task 9.

---

## File Map

Create:

| Path | Responsibility |
|---|---|
| `assets/fonts/JetBrainsMono-{Regular,Bold,Italic,BoldItalic}.ttf`, `assets/fonts/OFL.txt` | Bundled font and its license |
| `src/shell/shell.ts`, `registry.ts`, `zsh.ts`, `bash.ts`, `sh.ts`, `settings.ts` | Shell port, adapters, `shell` setting |
| `src/command-run/command-runner.ts`, `registry.ts`, `pty.ts`, `environment.ts`, `disposal.ts`, `settings.ts` | PTY runner port and adapter, command env, signal-safe kill, `cols`/`rows` settings |
| `src/terminal-emulation/terminal-emulator.ts`, `registry.ts`, `xterm.ts` | Emulator port (bytes → rows of cells) and adapter |
| `src/prompt/prompt.ts`, `registry.ts`, `default.ts`, `context.ts`, `settings.ts` | Prompt port, default adapter, git branch lookup, `prompt.*` settings |
| `src/highlighting/highlighter.ts`, `registry.ts`, `shell-tokens.ts` | Highlighter port and tokenizer |
| `src/theme/theme.ts`, `registry.ts`, `dark.ts`, `light.ts`, `palette.ts`, `settings.ts` | Theme port, two themes, 256-color resolution, `theme` setting |
| `src/frame/frame.ts` | Compose prompt + command + output rows into a fixed-width frame |
| `src/rendering/renderer.ts`, `registry.ts`, `svg-frame.ts`, `resvg.ts`, `fonts.ts`, `settings.ts` | Renderer port, frame → SVG, SVG → PNG, embedded font, `font.size` setting |
| `src/configuration/setting.ts`, `project.ts` | Setting type and value parsers; project root, `.termshot/` creation, default capture path |
| `src/publishing/settings.ts` | `publisher` setting |
| `test/shell.test.ts`, `command-runner.test.ts`, `terminal-emulation.test.ts`, `prompt.test.ts`, `highlighting.test.ts`, `theme.test.ts`, `frame.test.ts`, `rendering.test.ts`, `project.test.ts`, `stale-references.test.ts`, `e2e.test.ts` | Tests |

Modify: `src/run.ts`, `src/cli.ts`, `src/configuration/config.ts`, `src/configuration/config-store.ts`, `src/invocation/{flags,help,invocation,config-command}.ts`, `src/run-result/{result,build}.ts`, `test/{architecture,cli,config,run,emit}.test.ts`, `package.json`, `.gitignore`, `.github/workflows/ci.yml`, all docs listed in Task 13.

Rename: `src/screen-capture/` → `src/artifact/` (`artifact.ts`, `png-header.ts`), `test/screen-capture.test.ts` → `test/artifact.test.ts`.

Delete: `src/terminal-emulator/`, `src/terminal-session/`, `src/screen-capture/screen-capture.ts`, `src/command-run/{inner-script,exit-status,completion,run-plan,runner}.ts`, `test/{completion,exit-status,inner-script,session,terminal-emulator,window-lookup}.test.ts`.

---

### Task 1: Embedding spike — dependencies, font, rasterizer

The biggest risk goes first. Prove a compiled binary can render text to PNG with the wasm and fonts embedded, reading nothing from disk.

**Files:**
- Create: `assets/fonts/*`, `src/rendering/fonts.ts`, `src/rendering/resvg.ts`, `test/rendering.test.ts`
- Modify: `package.json`, `.gitignore`

**Interfaces:**
- Produces: `FONT_FAMILY: string` (`"JetBrains Mono"`) and `loadFontBuffers(): Promise<Uint8Array[]>` in `src/rendering/fonts.ts`; `rasterize(svg: string, scale: number): Promise<Uint8Array>` in `src/rendering/resvg.ts`.

- [ ] **Step 1: Add dependencies and font files**

```bash
bun add @xterm/headless@6.0.0 @resvg/resvg-wasm@2.6.2
curl -L -o /tmp/jbm.zip https://github.com/JetBrains/JetBrainsMono/releases/download/v2.304/JetBrainsMono-2.304.zip
unzip -o /tmp/jbm.zip 'fonts/ttf/JetBrainsMono-Regular.ttf' 'fonts/ttf/JetBrainsMono-Bold.ttf' 'fonts/ttf/JetBrainsMono-Italic.ttf' 'fonts/ttf/JetBrainsMono-BoldItalic.ttf' 'OFL.txt' -d /tmp/jbm
mkdir -p assets/fonts && cp /tmp/jbm/fonts/ttf/*.ttf /tmp/jbm/OFL.txt assets/fonts/
```

Remove `bun.lock` from `.gitignore` (CI runs `bun install --frozen-lockfile`, which needs the lockfile now that there are dependencies). Add `"assets"` to `files` in `package.json`.

- [ ] **Step 2: Write the failing test** in `test/rendering.test.ts`

```ts
test("rasterize turns an SVG with text into a 2x PNG", async () => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="40"><text x="4" y="24" font-family="${FONT_FAMILY}" font-size="18">hi</text></svg>`;
  const png = await rasterize(svg, 2);
  expect(pngHeader(png)).toEqual({ width: 200, height: 80 });
});
```

- [ ] **Step 3: Run it to see it fail**

Run: `bun test test/rendering.test.ts` — Expected: FAIL, module not found.

- [ ] **Step 4: Implement `fonts.ts` and `resvg.ts`**

`fonts.ts`: import each TTF with `import regularPath from "../../assets/fonts/JetBrainsMono-Regular.ttf" with { type: "file" };` and read with `Bun.file(path).bytes()`. `resvg.ts`: import the wasm the same way (`@resvg/resvg-wasm/index_bg.wasm`; if the package `exports` blocks the subpath, import it by relative path into `node_modules`), call `initWasm` once (memoized promise), then `new Resvg(svg, { fitTo: { mode: "zoom", value: scale }, font: { fontBuffers, loadSystemFonts: false, defaultFontFamily: FONT_FAMILY, monospaceFamily: FONT_FAMILY } }).render().asPng()`.

- [ ] **Step 5: Run the test** — `bun test test/rendering.test.ts` — Expected: PASS.

- [ ] **Step 6: Prove it works compiled, away from the repo**

Write a throwaway `/tmp/spike.ts` that imports `rasterize` from the repo, renders the SVG above and writes `/tmp/spike/out.png`. Then:

```bash
bun build --compile /tmp/spike.ts --outfile /tmp/spike/spike && cd /tmp/spike && ./spike && file out.png
```

Expected: `out.png: PNG image data, 200 x 80`. Also import `@xterm/headless` in the spike and write `"\x1b[31mhi"` to a `Terminal` to confirm it bundles. If wasm embedding fails, switch `resvg.ts` to `@resvg/resvg-js` with the `.node` addon imported the same way (spec's fallback) and re-run. Record which path worked in the commit message. Delete the spike files.

- [ ] **Step 7: Commit**

```bash
git add package.json bun.lock .gitignore assets src/rendering/fonts.ts src/rendering/resvg.ts test/rendering.test.ts
git commit -m "Embed font and wasm rasterizer for headless rendering"
```

---

### Task 2: Shell domain

**Files:**
- Create: `src/shell/{shell,registry,zsh,bash,sh,settings}.ts`, `test/shell.test.ts`
- Create: `src/configuration/setting.ts` (needed by every `settings.ts`)

**Interfaces:**
- Produces in `src/configuration/setting.ts`:
  - `interface Setting<T> { readonly default: T; readonly description: string; parse(value: unknown): T }`
  - `parseBooleanSetting(value: unknown): boolean` — accepts `true`, `false`, `"true"`, `"false"`.
  - `intSetting(min: number, max: number): (value: unknown) => number` — accepts integers or integer strings in range.
  - `enumSetting<T extends string>(values: readonly T[], noun: string): (value: unknown) => T` — error `unknown <noun> "x"; supported <noun>s: a, b`.
- Produces in `src/shell/shell.ts`: `interface Shell { readonly id: string; readonly executable: string; argv(executablePath: string, command: string): string[] }`; `class ShellNotFoundError extends Error`.
- Produces in `src/shell/registry.ts`: `type ShellId = "zsh" | "bash" | "sh"`, `SHELL_IDS`, `DEFAULT_SHELL_ID = "zsh"`, `parseShellId(value: unknown): ShellId`, `shellFor(id): Shell`, `resolveShellArgv(id: ShellId, command: string, which: (name: string) => string | null): string[]` (throws `ShellNotFoundError`).
- Produces in `src/shell/settings.ts`: `SHELL_SETTINGS = { shell: Setting<ShellId> }`.

- [ ] **Step 1: Write failing tests**

```ts
test("zsh runs the command with -c", () => {
  expect(resolveShellArgv("zsh", "echo hi", () => "/bin/zsh")).toEqual(["/bin/zsh", "-c", "echo hi"]);
});
test("a missing shell names itself and the config key", () => {
  expect(() => resolveShellArgv("bash", "x", () => null)).toThrow("bash was not found on PATH. Install it or pick another shell with `termshot config set shell <name>` (zsh, bash, sh)");
});
test("parseShellId rejects unknown shells", () => {
  expect(() => parseShellId("fish")).toThrow('unknown shell "fish"; supported shells: zsh, bash, sh');
});
test("setting parsers accept CLI strings and JSON values", () => {
  expect(parseBooleanSetting("false")).toBe(false);
  expect(intSetting(10, 48)("18")).toBe(18);
  expect(() => intSetting(10, 48)(9)).toThrow("must be an integer from 10 to 48");
});
```

- [ ] **Step 2: Run** `bun test test/shell.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** the files above. Each adapter's `argv` returns `[executablePath, "-c", command]`. The live `which` is `Bun.which`.
- [ ] **Step 4: Run** `bun test test/shell.test.ts` — Expected: PASS.
- [ ] **Step 5: Commit** — `git commit -m "Add shell domain"`

---

### Task 3: PTY command runner

**Files:**
- Create: `src/command-run/{command-runner,registry,pty,environment,disposal,settings}.ts`, `test/command-runner.test.ts`
- Move: `idempotentDisposer`, `registerSignalSafeDisposal`, `SignalPort`, `processSignalPort` from `src/terminal-session/session.ts` into `disposal.ts`, with their tests from `test/session.test.ts` (the old file is deleted in Task 12).

**Interfaces:**
- Produces in `command-runner.ts`:
  - `interface RunRequest { argv: string[]; cols: number; rows: number; env: Record<string, string>; cwd: string; timeoutMs: number }`
  - `interface CommandRunResult { output: Uint8Array; exitStatus: number | null; timedOut: boolean; durationMs: number }`
  - `interface CommandRunner { run(request: RunRequest): Promise<CommandRunResult> }`
- Produces in `environment.ts`: `commandEnv(base: Record<string, string | undefined>, termName: string, cols: number, rows: number): Record<string, string>` — copies defined `base` entries, then sets `TERM=termName`, `COLORTERM=truecolor`, `FORCE_COLOR=1`, `CLICOLOR_FORCE=1`, `COLUMNS`, `LINES`, `PAGER=cat`, `GIT_PAGER=cat`, `MANPAGER=cat`. `termName` is a parameter so the emulator's name stays in its own domain.
- Produces in `registry.ts`: `defaultCommandRunner(): CommandRunner`.
- Produces in `settings.ts`: `COMMAND_RUN_SETTINGS = { cols: Setting<number>, rows: Setting<number> }` (positive integers, defaults 120 and 30).

- [ ] **Step 1: Write failing tests** (real PTY; `/bin/sh` exists on macOS and CI)

```ts
const run = (cmd: string, timeoutMs = 60000) =>
  defaultCommandRunner().run({ argv: ["/bin/sh", "-c", cmd], cols: 80, rows: 24, env: commandEnv(process.env, "xterm-256color", 80, 24), cwd: process.cwd(), timeoutMs });
const text = (r: CommandRunResult) => new TextDecoder().decode(r.output);

test("captures output and exit status", async () => {
  const r = await run("echo hi; exit 3");
  expect(text(r)).toContain("hi");
  expect(r.exitStatus).toBe(3);
  expect(r.timedOut).toBe(false);
});
test("stdin is a tty and gets EOF, so cat finishes and nothing echoes", async () => {
  const r = await run("test -t 0 && echo tty; cat");
  expect(text(r)).toContain("tty");
  expect(text(r)).not.toContain("^D");
  expect(r.durationMs).toBeLessThan(2000);
});
test("a background child holding the pty does not block", async () => {
  const r = await run("sleep 30 & echo done");
  expect(text(r)).toContain("done");
  expect(r.durationMs).toBeLessThan(3000);
});
test("times out and kills the command", async () => {
  const r = await run("sleep 10", 300);
  expect(r).toMatchObject({ timedOut: true, exitStatus: null });
});
test("a command killed by a signal reports 128 + signal", async () => {
  expect((await run("kill -TERM $$")).exitStatus).toBe(143);
});
test("commandEnv forces color and disables pagers", () => {
  expect(commandEnv({ HOME: "/h", X: undefined }, "t", 100, 20)).toEqual({ HOME: "/h", TERM: "t", COLORTERM: "truecolor", FORCE_COLOR: "1", CLICOLOR_FORCE: "1", COLUMNS: "100", LINES: "20", PAGER: "cat", GIT_PAGER: "cat", MANPAGER: "cat" });
});
```

- [ ] **Step 2: Run** `bun test test/command-runner.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement `pty.ts`**

Create `new Bun.Terminal({ cols, rows, data })` collecting chunks. Before spawning, clear `ECHO` (`0x8` on both) and `ECHOCTL` (`0x40` on macOS, `0x200` on Linux, picked by `process.platform`) from `terminal.localFlags` so the EOF byte is never echoed. `Bun.spawn(argv, { terminal, env, cwd })`, then `terminal.write("\x04")`. Race `proc.exited` against `timeoutMs`; on timeout send `SIGTERM`, then `SIGKILL` after 500 ms, and return `timedOut: true, exitStatus: null`. After exit, wait for the terminal's `exit` callback (PTY EOF) for at most 250 ms, then `close()` — this is what stops a background child from blocking. Exit status: `proc.exitCode`, or `128 + os.constants.signals[proc.signalCode]` when signalled. Register the kill with `registerSignalSafeDisposal` so SIGINT/SIGTERM to termshot kills the child. A spawn error propagates as a thrown `Error` (Task 12 maps it to `environment-error`).

- [ ] **Step 4: Run** `bun test test/command-runner.test.ts` — Expected: PASS.
- [ ] **Step 5: Commit** — `git commit -m "Add PTY command runner"`

---

### Task 4: Terminal emulation

**Files:**
- Create: `src/terminal-emulation/{terminal-emulator,registry,xterm}.ts`, `test/terminal-emulation.test.ts`

**Interfaces:**
- Produces in `terminal-emulator.ts`:
  - `type CellColor = { kind: "default" } | { kind: "palette"; index: number } | { kind: "rgb"; rgb: number }`
  - `interface Cell { char: string; width: 0 | 1 | 2; fg: CellColor; bg: CellColor; bold: boolean; dim: boolean; italic: boolean; underline: boolean; inverse: boolean }` (`width: 0` is the trailing half of a wide char; `char` is `" "` for empty cells)
  - `type Row = Cell[]`
  - `interface TerminalEmulator { render(bytes: Uint8Array, cols: number, rows: number): Promise<Row[]> }` — returns every line (scrollback + screen), each exactly `cols` cells, with trailing blank lines removed. A blank line has only spaces with default bg and no inverse/underline.
- Produces in `registry.ts`: `defaultEmulator(): TerminalEmulator`, `EMULATOR_TERM_NAME = "xterm-256color"`.

- [ ] **Step 1: Write failing tests**

```ts
const render = (s: string, cols = 20, rows = 5) => defaultEmulator().render(new TextEncoder().encode(s), cols, rows);
const lineText = (row: Row) => row.map((c) => c.char).join("").trimEnd();

test("plain lines, trailing blanks trimmed", async () => {
  const rows = await render("a\r\nb\r\n\r\n");
  expect(rows.map(lineText)).toEqual(["a", "b"]);
  expect(rows[0]!.length).toBe(20);
});
test("palette, rgb and bold attributes survive", async () => {
  const [row] = await render("\x1b[1;31mR\x1b[0m\x1b[38;2;1;2;3mT");
  expect(row![0]).toMatchObject({ char: "R", bold: true, fg: { kind: "palette", index: 1 } });
  expect(row![1]!.fg).toEqual({ kind: "rgb", rgb: 0x010203 });
});
test("wide characters take two cells", async () => {
  const [row] = await render("界x");
  expect(row!.slice(0, 3).map((c) => c.width)).toEqual([2, 0, 1]);
});
test("output taller than rows keeps scrollback", async () => {
  const out = Array.from({ length: 12 }, (_, i) => `l${i}`).join("\r\n");
  expect((await render(out, 20, 5)).map(lineText)).toHaveLength(12);
});
test("carriage-return progress shows only the final state", async () => {
  expect((await render("10%\r50%\r100%")).map(lineText)).toEqual(["100%"]);
});
test("a screen clear leaves only what came after it", async () => {
  expect((await render("old\r\n\x1b[2J\x1b[Hnew")).map(lineText).filter(Boolean)).toEqual(["new"]);
});
```

- [ ] **Step 2: Run** `bun test test/terminal-emulation.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement `xterm.ts`** with `new Terminal({ cols, rows, scrollback: 10000, allowProposedApi: true })`, await `term.write(bytes, resolve)`, read `term.buffer.active` lines `0..length-1` via `getLine(y).getCell(x)` (`getChars`, `getWidth`, `isFgPalette/isFgRGB/getFgColor`, same for bg, `isBold`, `isDim`, `isItalic`, `isUnderline`, `isInverse`), then `dispose()`. If the screen-clear test shows the pre-clear line in scrollback, drop lines above the last full-screen clear by reading only from `buffer.active.baseY` when the clear happened; keep it simple and covered by the test.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** — `git commit -m "Add headless terminal emulation"`

---

### Task 5: Highlighter

**Files:**
- Create: `src/highlighting/{highlighter,registry,shell-tokens}.ts`, `test/highlighting.test.ts`

**Interfaces:**
- Produces in `highlighter.ts`: `type HighlightRole = "command" | "argument" | "flag" | "string" | "variable" | "operator" | "comment" | "path" | "whitespace"`, `HIGHLIGHT_ROLES`, `interface Token { text: string; role: HighlightRole }`, `interface Highlighter { tokenize(command: string): Token[] }`.
- Produces in `registry.ts`: `defaultHighlighter(): Highlighter`.

Rules (single left-to-right pass):
- Command position: start of input, and after `|`, `||`, `&&`, `;`, `&`, `(`. The word there is `command`, even if it contains `/`. A `NAME=value` word in command position is `variable` and command position stays open.
- Operators: `||`, `&&`, `>>`, `2>`, `|`, `;`, `&`, `>`, `<`, `(`, `)`.
- `'…'` and `"…"` (backslash escapes inside double quotes) are one `string` token; an unterminated quote runs to the end.
- `$NAME`, `${…}`, `$?`, `$1` are `variable`.
- `#` at the start of a word starts a `comment` to end of input.
- Outside command position: starts with `-` → `flag`; contains `/` or starts with `~` or `.` → `path`; else `argument`.
- Runs of spaces/tabs are `whitespace`.

- [ ] **Step 1: Write failing tests**

```ts
const roles = (s: string) => defaultHighlighter().tokenize(s).filter((t) => t.role !== "whitespace").map((t) => [t.text, t.role]);

test("commands after operators", () => {
  expect(roles("bun test && git log --oneline | head -5")).toEqual([
    ["bun", "command"], ["test", "argument"], ["&&", "operator"], ["git", "command"], ["log", "argument"],
    ["--oneline", "flag"], ["|", "operator"], ["head", "command"], ["-5", "flag"],
  ]);
});
test("strings, variables, paths, comments, env prefix", () => {
  expect(roles(`FOO=1 ./run.sh "a b" $HOME ~/x # note`)).toEqual([
    ["FOO=1", "variable"], ["./run.sh", "command"], ['"a b"', "string"], ["$HOME", "variable"], ["~/x", "path"], ["# note", "comment"],
  ]);
});
test("tokens always reassemble to the exact input", () => {
  for (const s of [`echo 'unterminated`, `a|b;c&&d`, `  x  `, `echo "a\\"b" <in >out 2>err`, ""]) {
    expect(defaultHighlighter().tokenize(s).map((t) => t.text).join("")).toBe(s);
  }
});
```

- [ ] **Step 2–4:** Run (FAIL), implement `shell-tokens.ts`, run (PASS).
- [ ] **Step 5: Commit** — `git commit -m "Add command highlighter"`

---

### Task 6: Prompt

**Files:**
- Create: `src/prompt/{prompt,registry,default,context,settings}.ts`, `test/prompt.test.ts`

**Interfaces:**
- Produces in `prompt.ts`:
  - `type PromptRole = "directory" | "branch" | "symbol" | "text"`, `PROMPT_ROLES`
  - `interface PromptSegment { text: string; role: PromptRole }`
  - `interface PromptContext { cwd: string; home: string; gitBranch: string | null }`
  - `type DirectoryStyle = "full" | "short" | "none"`
  - `interface PromptOptions { show: boolean; directory: DirectoryStyle; git: boolean; symbol: string }`
  - `interface Prompt { segments(context: PromptContext, options: PromptOptions): PromptSegment[] }`
- Produces in `context.ts`: `readGitBranch(cwd: string, run: (argv: string[]) => { exitCode: number; stdout: string } | null): string | null` — `run` returns `null` when `git` is not on PATH. Tries `git symbolic-ref --short -q HEAD`, falls back to `git rev-parse --short HEAD` (detached HEAD), else `null`. Plus `liveGitRunner` using `Bun.which("git")` and `Bun.spawnSync` with `cwd`.
- Produces in `registry.ts`: `defaultPrompt(): Prompt`.
- Produces in `settings.ts`: `PROMPT_SETTINGS` with keys `prompt.show`, `prompt.directory`, `prompt.git`, `prompt.symbol` (non-empty, at most 4 characters counted by code points).

- [ ] **Step 1: Write failing tests**

```ts
const ctx = { cwd: "/Users/u/tools/termshot", home: "/Users/u", gitBranch: "main" };
const opts: PromptOptions = { show: true, directory: "full", git: true, symbol: "❯" };
const text = (s: PromptSegment[]) => s.map((x) => x.text).join("");

test("default look", () => {
  const s = defaultPrompt().segments(ctx, opts);
  expect(text(s)).toBe("~/tools/termshot on main ❯ ");
  expect(s.map((x) => x.role)).toEqual(["directory", "text", "branch", "text", "symbol", "text"]);
});
test("variants", () => {
  expect(text(defaultPrompt().segments(ctx, { ...opts, directory: "short" }))).toBe("termshot on main ❯ ");
  expect(text(defaultPrompt().segments(ctx, { ...opts, directory: "none" }))).toBe("main ❯ ");
  expect(text(defaultPrompt().segments({ ...ctx, gitBranch: null }, opts))).toBe("~/tools/termshot ❯ ");
  expect(text(defaultPrompt().segments(ctx, { ...opts, git: false, symbol: "$" }))).toBe("~/tools/termshot $ ");
  expect(defaultPrompt().segments(ctx, { ...opts, show: false })).toEqual([]);
});
test("home itself shows as ~, paths outside home stay full", () => {
  expect(text(defaultPrompt().segments({ ...ctx, cwd: "/Users/u" }, { ...opts, git: false }))).toBe("~ ❯ ");
  expect(text(defaultPrompt().segments({ ...ctx, cwd: "/Users/uu" }, { ...opts, git: false }))).toBe("/Users/uu ❯ ");
});
test("readGitBranch", () => {
  expect(readGitBranch("/x", () => null)).toBeNull();
  expect(readGitBranch("/x", (a) => (a.includes("symbolic-ref") ? { exitCode: 1, stdout: "" } : { exitCode: 0, stdout: "abc1234\n" }))).toBe("abc1234");
});
```

- [ ] **Step 2–4:** Run (FAIL), implement, run (PASS).
- [ ] **Step 5: Commit** — `git commit -m "Add default prompt"`

---

### Task 7: Themes

**Files:**
- Create: `src/theme/{theme,registry,dark,light,palette,settings}.ts`, `test/theme.test.ts`

**Interfaces:**
- Produces in `theme.ts`: `interface Theme { readonly id: string; background: string; foreground: string; ansi: readonly string[] /* 16 */; prompt: Record<PromptRole, string>; highlight: Record<HighlightRole, string> }`. (No cursor color: the cursor is never drawn.)
- Produces in `palette.ts`: `paletteColor(theme: Theme, index: number): string` — 0–15 from `theme.ansi`, 16–231 the standard 6×6×6 cube (levels `0,95,135,175,215,255`), 232–255 greys `8 + 10·(i−232)`; `rgbHex(rgb: number): string`.
- Produces in `registry.ts`: `ThemeId = "dark" | "light"`, `THEME_IDS`, `DEFAULT_THEME_ID = "dark"`, `parseThemeId`, `themeFor(id): Theme`.
- Produces in `settings.ts`: `THEME_SETTINGS = { theme: Setting<ThemeId> }`.

Colors (chosen with the user: cool graphite). Builder may nudge values to pass the contrast test.

| | dark | light |
|---|---|---|
| background / foreground | `#16181d` / `#d8dee9` | `#f7f8fa` / `#1f2430` |
| ansi 0–7 | `#2a2e38 #f7768e #9ece6a #e0af68 #7aa2f7 #bb9af7 #7dcfff #c0caf5` | `#1f2430 #c4314b #3d7a1f #8a6100 #2c5fc4 #8241b8 #0f7490 #5f6673` |
| ansi 8–15 | `#737b8c #ff8fa3 #b5e48c #f0c987 #9bbcff #d0b4ff #a5e3ff #ffffff` | `#6b7280 #a8243b #2f6316 #6e4d00 #1f4aa0 #6a2f9c #0a5c72 #3a3f4b` |
| prompt directory / branch / symbol / text | `#7aa2f7 #bb9af7 #9ece6a #d8dee9` | `#2c5fc4 #8241b8 #3d7a1f #1f2430` |
| highlight command / argument / flag / string / variable / operator / comment / path / whitespace | `#7dcfff #d8dee9 #e0af68 #9ece6a #bb9af7 #f7768e #737b8c #c0caf5 #d8dee9` | `#0f7490 #1f2430 #8a6100 #3d7a1f #8241b8 #c4314b #6b7280 #2c5fc4 #1f2430` |

Light theme maps ANSI white (7, 15) to dark greys on purpose so `ls --color` and similar stay readable on a light background.

- [ ] **Step 1: Write failing tests**

```ts
test("256-color resolution", () => {
  const t = themeFor("dark");
  expect(paletteColor(t, 1)).toBe("#f7768e");
  expect(paletteColor(t, 196)).toBe("#ff0000");
  expect(paletteColor(t, 232)).toBe("#080808");
});
test("every color reaches 3:1 contrast against its background, foreground 7:1", () => {
  for (const id of THEME_IDS) {
    const t = themeFor(id);
    expect(contrast(t.foreground, t.background)).toBeGreaterThanOrEqual(7);
    for (const c of [...t.ansi.slice(1), ...Object.values(t.prompt), ...Object.values(t.highlight)]) {
      expect(contrast(c, t.background)).toBeGreaterThanOrEqual(3);
    }
  }
});
```

`contrast` is a WCAG relative-luminance helper defined in the test file. ANSI 0 is excluded because it is "black" by definition.

- [ ] **Step 2–4:** Run (FAIL), implement, run (PASS).
- [ ] **Step 5: Commit** — `git commit -m "Add dark and light themes"`

---

### Task 8: Frame

**Files:**
- Create: `src/frame/frame.ts`, `test/frame.test.ts`

**Interfaces:**
- Consumes: `PromptSegment` (Task 6), `Token` (Task 5), `Row`, `Cell`, `CellColor` (Task 4).
- Produces in `frame.ts`:
  - `type Paint = CellColor | { kind: "prompt"; role: PromptRole } | { kind: "highlight"; role: HighlightRole }`
  - `interface FrameCell { char: string; width: 0 | 1 | 2; fg: Paint; bg: Paint; bold: boolean; dim: boolean; italic: boolean; underline: boolean; inverse: boolean }`
  - `interface Frame { cols: number; rows: FrameCell[][] }`
  - `buildFrame(input: { prompt: PromptSegment[]; command: Token[]; output: Row[]; cols: number; rows: number }): Frame`

Rules: prompt segments then command tokens are laid into cells, wrapping at `cols` (use `Bun.stringWidth` per character for wide chars; a wide char that doesn't fit at the end of a line moves to the next). These head lines are always shown in full, even past `rows`. Output gets `max(0, rows − headLines)` lines, taken from the end of `output`. Every frame row is exactly `cols` cells. An empty command still yields one head line.

- [ ] **Step 1: Write failing tests**

```ts
test("head line then output", () => {
  const f = buildFrame({ prompt: [{ text: "~ ❯ ", role: "symbol" }], command: [{ text: "ls", role: "command" }], output: [row("a"), row("b")], cols: 10, rows: 30 });
  expect(f.rows.map(text)).toEqual(["~ ❯ ls", "a", "b"]);
  expect(f.rows.every((r) => r.length === 10)).toBe(true);
  expect(f.rows[0]![4]!.fg).toEqual({ kind: "highlight", role: "command" });
});
test("no output gives a one-line frame", () => {
  expect(buildFrame({ prompt: [], command: [tok("true")], output: [], cols: 10, rows: 30 }).rows).toHaveLength(1);
});
test("tall output keeps the head and the last lines", () => {
  const out = Array.from({ length: 50 }, (_, i) => row(`l${i}`));
  const f = buildFrame({ prompt: [], command: [tok("x")], output: out, cols: 10, rows: 5 });
  expect(f.rows.map(text)).toEqual(["x", "l46", "l47", "l48", "l49"]);
});
test("a command longer than rows lines is shown whole, output dropped", () => {
  const f = buildFrame({ prompt: [], command: [tok("y".repeat(35))], output: [row("out")], cols: 10, rows: 3 });
  expect(f.rows.map(text)).toEqual(["yyyyyyyyyy", "yyyyyyyyyy", "yyyyyyyyyy", "yyyyy"]);
});
```

`row(s)`, `tok(s)` and `text(r)` are small helpers in the test file.

- [ ] **Step 2–4:** Run (FAIL), implement, run (PASS).
- [ ] **Step 5: Commit** — `git commit -m "Compose prompt, command and output into a frame"`

---

### Task 9: Renderer

**Files:**
- Create: `src/rendering/{renderer,registry,svg-frame,settings}.ts`
- Modify: `test/rendering.test.ts`

**Interfaces:**
- Consumes: `Frame` (Task 8), `Theme`, `paletteColor`, `rgbHex` (Task 7), `rasterize`, `FONT_FAMILY` (Task 1).
- Produces in `renderer.ts`: `interface Renderer { render(frame: Frame, theme: Theme, fontSize: number): Promise<Uint8Array> }`, `RENDER_SCALE = 2`, `PADDING = 32`, `RADIUS = 14`, `CELL_WIDTH_EM = 0.6`, `LINE_HEIGHT_EM = 1.5`.
- Produces in `svg-frame.ts`: `frameToSvg(frame: Frame, theme: Theme, fontSize: number, fontFamily: string): { svg: string; width: number; height: number }` — `width = 2·PADDING + cols·0.6·fontSize`, `height = 2·PADDING + rows·1.5·fontSize`.
- Produces in `registry.ts`: `defaultRenderer(): Renderer`.
- Produces in `settings.ts`: `RENDERING_SETTINGS = { "font.size": Setting<number> }` (10–48, default 18).

SVG shape: one `<rect>` with `rx=14` filled with `theme.background`; per row, one `<rect>` per run of non-default background; one `<text xml:space="preserve">` per run of cells with identical style, positioned at the run's first column (start a new run after any wide char so positions stay exact). Bold → `font-weight="bold"`, italic → `font-style="italic"`, underline → `text-decoration="underline"`, dim → `opacity="0.6"`, inverse swaps fg/bg (default fg/bg resolve to theme foreground/background first). Width-0 cells are skipped. Text is XML-escaped (`& < > " '`).

- [ ] **Step 1: Write failing tests** (append to `test/rendering.test.ts`)

```ts
test("frame size follows the grid and font size", () => {
  const { width, height } = frameToSvg(frameOf(["hi"], 120), themeFor("dark"), 18, FONT_FAMILY);
  expect([width, height]).toEqual([1360, 91]);
});
test("special characters are escaped", () => {
  const { svg } = frameToSvg(frameOf([`a<b & "c"`], 20), themeFor("dark"), 18, FONT_FAMILY);
  expect(svg).toContain("a&lt;b &amp; &quot;c&quot;");
});
test("renders a real PNG at 2x, including emoji and CJK", async () => {
  const png = await defaultRenderer().render(frameOf(["ok 🚀 界", "<&>"], 40), themeFor("light"), 18);
  expect(pngHeader(png)).toEqual({ width: 2 * (64 + 40 * 10.8), height: 2 * (64 + 2 * 27) });
});
```

`frameOf(lines, cols)` builds a `Frame` of default-colored cells in the test file.

- [ ] **Step 2–4:** Run (FAIL), implement, run (PASS). Round width/height to whole pixels with `Math.ceil` if `0.6·fontSize` is fractional; adjust the expected numbers only if you do.
- [ ] **Step 5: Look at the output.** Render `ls --color=always /` and `bun test` output (captured through Tasks 3–4) in both themes to a scratch PNG and open it. Fix colors that look wrong.
- [ ] **Step 6: Commit** — `git commit -m "Render frames to PNG"`

---

### Task 10: Project config

**Files:**
- Create: `src/configuration/project.ts`, `src/publishing/settings.ts`, `test/project.test.ts`
- Modify: `src/configuration/config.ts`, `src/configuration/config-store.ts`, `src/invocation/config-command.ts`, `src/cli.ts` (`runConfig` only), `test/config.test.ts`

**Interfaces:**
- Consumes: every `*_SETTINGS` object from Tasks 2, 3, 6, 7, 9, plus `PUBLISHING_SETTINGS = { publisher: Setting<PublisherId> }`.
- Produces in `config.ts`: `SETTINGS` (all of the above spread into one record, in the spec's table order), `type ConfigKey = keyof typeof SETTINGS`, `type Config`, `type StoredConfig = Partial<Config>`, `CONFIG_KEY_NAMES`, `parseConfigKey`, `parseStoredConfig(raw: unknown): StoredConfig` (takes the **nested** JSON), `effectiveConfig`, `setConfigValue`, `unsetConfigValue`. `CONFIG_KEYS` is renamed to `SETTINGS`; `terminal` key is gone.
- Produces in `config-store.ts`: `readStoredConfig(path)`, `writeStoredConfig(path, stored)` — writes nested JSON (`font.size` → `{"font":{"size":18}}`), 2-space indent, trailing newline. `configPath()` with XDG is deleted.
- Produces in `project.ts`:
  - `interface ProjectProbe { exists(path: string): boolean; gitTopLevel(cwd: string): string | null }`
  - `findProjectRoot(cwd: string, probe: ProjectProbe): string | null` — nearest ancestor (cwd included) containing `.termshot/`, else git top-level, else `null`.
  - `configPathFor(root: string): string` → `<root>/.termshot/config.json`
  - `ensureTermshotDir(root: string): string` — creates `<root>/.termshot/` and, only when it creates the folder, `.gitignore` containing `captures/\n`. Returns the folder path.
  - `defaultCapturePath(root: string | null, home: string, stamp: string): string` → `<root>/.termshot/captures/<stamp>.png` or `<home>/termshot/<stamp>.png`.
  - `liveProjectProbe` using `existsSync` and `git rev-parse --show-toplevel` (null if git missing or fails).

`runConfig` in `cli.ts`: root = `findProjectRoot(cwd) ?? cwd`. `show` reads `configPathFor(root)` if it exists and prints `{tool, version, configPath, config}` (configPath is where `set` would write). `set`/`unset` call `ensureTermshotDir(root)` then write.

- [ ] **Step 1: Write failing tests**

```ts
// test/project.test.ts — uses mkdtemp dirs
test("nearest .termshot wins over git top-level", () => { /* tmp/a/.termshot, cwd tmp/a/b, gitTopLevel → tmp → expect tmp/a */ });
test("falls back to git top-level, then null", () => { /* no .termshot: gitTopLevel → "/repo" gives "/repo"; null gives null */ });
test("ensureTermshotDir creates .gitignore once and never overwrites it", () => { /* write custom .gitignore after first call, call again, content unchanged */ });
test("default capture path inside and outside a project", () => {
  expect(defaultCapturePath("/p", "/h", "20261115-101010")).toBe("/p/.termshot/captures/20261115-101010.png");
  expect(defaultCapturePath(null, "/h", "20261115-101010")).toBe("/h/termshot/20261115-101010.png");
});

// test/config.test.ts — replace terminal cases
test("dotted keys round-trip through nested JSON", () => {
  const stored = setConfigValue({}, "font.size", "20");
  writeStoredConfig(path, stored);
  expect(JSON.parse(readFileSync(path, "utf8"))).toEqual({ font: { size: 20 } });
  expect(readStoredConfig(path)).toEqual({ "font.size": 20 });
});
test("unknown nested key is rejected with its dotted name", () => {
  expect(() => parseStoredConfig({ font: { colour: 1 } })).toThrow('unknown config key "font.colour"');
});
test("defaults match the spec table", () => {
  expect(effectiveConfig({})).toEqual({ shell: "zsh", theme: "dark", "font.size": 18, cols: 120, rows: 30, "prompt.show": true, "prompt.directory": "full", "prompt.git": true, "prompt.symbol": "❯", publisher: "rclone" });
});
test("bad values are rejected", () => {
  expect(() => setConfigValue({}, "font.size", "9")).toThrow();
  expect(() => setConfigValue({}, "prompt.symbol", "")).toThrow();
  expect(() => setConfigValue({}, "prompt.symbol", "abcde")).toThrow();
  expect(() => setConfigValue({}, "prompt.show", "yes")).toThrow();
});
test("config set from a plain folder creates .termshot there and nothing else", () => {
  // spawn `bun <repo>/src/cli.ts config set theme light` with cwd = empty tmp dir (not a git repo)
  // expect tmp/.termshot/config.json == {"theme":"light"} and tmp/.termshot/.gitignore == "captures/\n"
});
```

- [ ] **Step 2–4:** Run (FAIL), implement, run `bun test` (PASS). The capture path in `cli.ts` still reads the old config fields until Task 12; that's expected. Every test must pass.
- [ ] **Step 5: Commit** — `git commit -m "Move config to per-project .termshot/config.json"`

---

### Task 11: Flags, help and the JSON record

**Files:**
- Modify: `src/invocation/{flags,invocation,help}.ts`, `src/run-result/{result,build}.ts`, `test/cli.test.ts`, `test/emit.test.ts`

**Interfaces:**
- Produces in `invocation.ts`: `interface Invocation { command: string; output: string | null; cols: number | null; rows: number | null; publishDest: string | null; publishSize: number; publishLabel: string | null; publisher: PublisherId | null }` (`settleMs` and `terminal` removed; `cols`/`rows` are `null` when the flag wasn't passed, so config can fill them).
- Produces in `result.ts`: `interface TerminalResult { shell: string | null; cols: number | null; rows: number | null }` (`emulator` removed).
- `flags.ts`: `REMOVED_FLAGS` gains `"terminal"` and `"settle"`; `DEFAULT_RUN_COLS`/`DEFAULT_RUN_ROWS` are deleted (defaults live in `command-run/settings.ts`).
- `help.ts`: describe the headless model: "runs a command in a built-in headless terminal and renders it to a PNG". Default output line: `.termshot/captures/<timestamp>.png in a project, else ~/termshot/<timestamp>.png`. CONFIG section: stored in `.termshot/config.json` at the project root. KEYS lists every `SETTINGS` entry with description and default. Shell and theme names come from their registries, never literals.

- [ ] **Step 1: Write failing tests** (`test/cli.test.ts`)

```ts
for (const flag of ["--terminal", "--settle", ...OLD_REMOVED]) { /* existing removed-flag test, now including both */ }
test("--cols and --rows stay null when not passed", () => {
  const r = parseFlags(["--run", "x"]);
  expect(r.ok && [r.invocation.cols, r.invocation.rows]).toEqual([null, null]);
});
test("help names the config file and every key", () => {
  const help = helpText("0.7.0");
  expect(help).toContain(".termshot/config.json");
  for (const key of CONFIG_KEY_NAMES) expect(help).toContain(key);
});
test("an empty record has a null shell", () => {
  expect(buildResult({ tool: "termshot", version: "0", status: "usage-error" }).terminal).toEqual({ shell: null, cols: null, rows: null });
});
```

Delete the `--terminal kitty` test and the `DEFAULT_RUN_COLS` test.

- [ ] **Step 2–4:** Run (FAIL), implement, run `bun test` (PASS).
- [ ] **Step 5: Commit** — `git commit -m "Update flags, help and record for the headless terminal"`

---

### Task 12: Orchestrator, wiring and removal of the old backend

**Files:**
- Modify: `src/run.ts`, `src/cli.ts`, `test/run.test.ts`, `test/architecture.test.ts`
- Rename: `src/screen-capture/{artifact,png-header}.ts` → `src/artifact/`, `test/screen-capture.test.ts` → `test/artifact.test.ts`
- Delete: everything in the File Map's Delete list.

**Interfaces:**
- Consumes: all ports above.
- Produces in `run.ts`:

```ts
export interface ArtifactsPort { write(path: string, data: Uint8Array): ArtifactRecord }
export interface PublisherPort { publish(request: PublishRequest): PublishedImage }
export interface ShellPort { argv(command: string): string[] } // throws when the shell is missing
export interface RunPorts { shell: ShellPort; runner: CommandRunner; emulator: TerminalEmulator; prompt: Prompt; highlighter: Highlighter; renderer: Renderer; artifacts: ArtifactsPort; publisher: PublisherPort }
export interface CaptureSettings { shell: ShellId; theme: Theme; fontSize: number; cols: number; rows: number; prompt: PromptOptions; publisher: PublisherId }
export interface RunSetup { version: string; invocation: Invocation; settings: CaptureSettings; promptContext: PromptContext; env: Record<string, string>; cwd: string; outputPath: string }
export async function runTermshot(setup: RunSetup, ports: RunPorts): Promise<RunResult>
```

The spec's `clock` port is dropped: the runner measures its own duration and nothing else in `run.ts` needs time.

Flow and error mapping (record `terminal.shell` is always `settings.shell`; `cols`/`rows` are `frame.cols` and `frame.rows.length` once a frame exists, else `null`):

| Step | Failure | status | step |
|---|---|---|---|
| `ports.shell.argv` | throws | `environment-error` | `shell` |
| `ports.runner.run` | throws | `environment-error` | `command-run` |
| | `timedOut` | `timeout`, message `command did not finish within 60000ms` | `command-run` |
| `ports.emulator.render` | throws | `internal-error` | `terminal-emulation` |
| `buildFrame` + `ports.renderer.render` | throws | `internal-error`, no PNG written | `rendering` |
| `ports.artifacts.write` | throws | `environment-error` | `artifact` |
| `pngHeader` | throws | `internal-error` unless command failed (current precedence) | `artifact` |
| `ports.publisher.publish` | throws | `publish-failed` | `publish` |

`command.exitStatus` and `durationMs` are recorded in every record after the run step, including render failures.

`cli.ts` `runCapture`: cwd = `process.cwd()`; root = `findProjectRoot(cwd, liveProjectProbe)`; config from `configPathFor(root)` when root exists, else defaults; `cols`/`rows` = flag ?? config; publisher = flag ?? config; output = `-o` ?? (`root` ? `ensureTermshotDir(root)` then `defaultCapturePath(root, …)` : `defaultCapturePath(null, homedir(), …)`); env = `commandEnv(process.env, EMULATOR_TERM_NAME, cols, rows)`; prompt context from `homedir()` and `readGitBranch(cwd, liveGitRunner)` only when `prompt.git` is on; shell port = `{ argv: (c) => resolveShellArgv(config.shell, c, Bun.which) }`; `await runTermshot(...)`; emit; exit.

- [ ] **Step 1: Rewrite `test/run.test.ts` against fake ports.** Keep the two existing behaviors (publish failure keeps the PNG and exits 6; child exit 3 is `command-failed`, not exit code 3). Add:

```ts
test("ok run records shell and rendered grid", async () => { /* fake frame of 3 rows → terminal == {shell:"zsh", cols:120, rows:3}, status ok */ });
test("missing shell is an environment error at step shell, nothing written", async () => {});
test("timeout writes nothing and reports null grid", async () => {});
test("render failure is internal-error, no artifact, command status kept", async () => {});
test("unwritable output is environment-error at step artifact", async () => {});
test("the frame gets prompt segments and highlighted command tokens", async () => { /* spy renderer receives frame whose row 0 text starts with the fake prompt then the command */ });
```

- [ ] **Step 2: Run** `bun test test/run.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement `run.ts`, rewire `cli.ts`, do the rename and deletions.**
- [ ] **Step 4: Update `test/architecture.test.ts`.** Drop the terminal test. Add, using the existing `offenders(owner, names)` helper:
  - `shell`: `SHELL_IDS`
  - `terminal-emulation`: `["xterm"]`
  - `rendering`: `["resvg", "JetBrains", "JetBrainsMono"]`
  - keep `publishing` as is.
- [ ] **Step 5: Run** `bun test && bun run build && ./dist/termshot --run "ls --color=always" -o /tmp/ts-check.png | jq -c '{status, terminal}'` — Expected: all tests pass; `{"status":"ok","terminal":{"shell":"zsh","cols":120,"rows":<n>}}`. Open `/tmp/ts-check.png` and check it looks right.
- [ ] **Step 6: Commit** — `git commit -m "Run captures through the headless terminal and drop window capture"`

---

### Task 13: Docs, metadata, CI and end-to-end checks

**Files:**
- Create: `test/stale-references.test.ts`, `test/e2e.test.ts`
- Modify: `README.md`, `AGENTS.md`, `skills/termshot/SKILL.md`, `CONTRIBUTING.md`, `SECURITY.md` (if it mentions the old model), `package.json`, `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `.github/ISSUE_TEMPLATE/*`, `.github/workflows/ci.yml`

- [ ] **Step 1: Write the stale-reference test** (`test/stale-references.test.ts`)

Scan `git ls-files`, skipping `docs/superpowers/`, `assets/fonts/`, binary files and this test file. Fail with `file:line` for each match of:

```ts
const NAMES = /ghostty|alacritty|screencapture|screen recording/i;
const FLAGS = /--settle\b|--terminal\b/;          // skipped on lines matching /removed/i
const WINDOW = /\b(terminal|new|fresh|the|a) window\b|\bwindow (manager|title|id)s?\b/i;
```

- [ ] **Step 2: Write the end-to-end test** (`test/e2e.test.ts`)

`beforeAll` runs `bun run build`. Then, in an empty `mkdtemp` folder with `HOME` set to another temp folder:

```ts
test("compiled binary captures echo hi", () => {
  const p = Bun.spawnSync([BIN, "--run", "echo hi", "-o", join(tmp, "e2e.png")], { cwd: tmp, env: { ...process.env, HOME: home } });
  const record = JSON.parse(p.stdout.toString());
  expect(record.status).toBe("ok");
  expect(pngHeader(readFileSync(join(tmp, "e2e.png")))).toMatchObject({ width: expect.any(Number) });
});
test("outside a project, a capture leaves no .termshot behind", () => {
  // no -o: expect existsSync(join(tmp, ".termshot")) false, and record.capture.path under join(home, "termshot")
});
test("a trailing exit no longer times out", () => {
  // --run "exit 3": status command-failed, command.exitStatus 3, durationMs < 5000
});
```

- [ ] **Step 3: Run** `bun test test/stale-references.test.ts test/e2e.test.ts` — Expected: stale-references FAILS listing the docs; e2e PASSES.

- [ ] **Step 4: Update the docs**
  - `README.md`: intro and Requirements (macOS, Bun only for building; no terminal app, no permissions). Replace "Choosing a terminal" with "Project config" (location rule, `.gitignore`, key table from the spec, shell/theme/prompt examples). Options table without `--terminal`/`--settle`. Output section with the new `terminal` block. Replace "How a capture stays clean" with how the headless run works (PTY, color env, pagers disabled, EOF on stdin). Limits: 60 s, non-interactive, characters missing from the font draw as blank boxes. Add an "Upgrading to 0.7" note: the terminal-app backend and `--terminal`/`--settle` were removed; `~/.config/termshot/config.json` is no longer read, so run `termshot config set publisher <name>` in each project that needs it.
  - `AGENTS.md`: rewrite the intro line ("runs one command in a built-in headless terminal and renders it to a PNG"). Drop the golden rules about the terminal, Screen Recording and trailing `exit`. Preflight recipe becomes `termshot --version` + `termshot config` + `echo preflight` capture checking `.status` and `.terminal.shell`. Re-run every recipe on this machine and paste the real records (version 0.7.0). Pitfalls: drop trailing `exit`, missing terminal, Screen Recording, window timeout and tiling window manager; add missing shell (`environment-error` at step `shell`) and render failure (`internal-error` at step `rendering`). Update the exit-code table meanings from the spec.
  - `skills/termshot/SKILL.md`: description without "macOS"-only window wording, `compatibility: Needs \`termshot\` on PATH. macOS.`, failure section matching AGENTS pitfalls, `version: "0.7.0"`.
  - `package.json`: version `0.7.0`; description `CLI tool for AI coding agents. Runs a command in a built-in headless terminal, renders it to a PNG, and prints a JSON record with a sha256.`; keywords drop `ghostty`, `alacritty`, `screencapture`, add `headless`.
  - `.claude-plugin/plugin.json` (version `0.7.0`, description), `.claude-plugin/marketplace.json` (description), `CONTRIBUTING.md`, `SECURITY.md`, `.github/ISSUE_TEMPLATE/*` (drop terminal-app fields; ask for shell and `termshot config` output instead).

- [ ] **Step 5: CI** — in `.github/workflows/ci.yml`, before `bun install`, add `- run: sudo apt-get update && sudo apt-get install -y zsh`.

- [ ] **Step 6: Verify everything**

Run: `bun test && bun run build && ./dist/termshot --version`
Expected: all tests pass, prints `0.7.0`.
Run: `git grep -niE 'ghostty|alacritty|screencapture|screen recording' -- ':!docs/superpowers'`
Expected: no output.

- [ ] **Step 7: Commit** — `git commit -m "Document the headless terminal and release 0.7.0"`
