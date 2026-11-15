import { expect, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { VERSION, captureSettings, promptContext } from "../src/cli.ts";
import { CONFIG_KEY_NAMES, effectiveConfig } from "../src/configuration/config.ts";
import { parseFlags } from "../src/invocation/flags.ts";
import { helpText } from "../src/invocation/help.ts";
import { buildResult } from "../src/run-result/build.ts";
import { themeFor } from "../src/theme/registry.ts";
import type { GitRunner } from "../src/prompt/context.ts";

const REMOVED_FLAGS = ["--annotate", "--copy", "--window-pick", "--box", "--marker", "--list", "--window", "--stdout", "--terminal", "--settle"];

test("VERSION is a semver string", () => {
  expect(VERSION).toMatch(/^\d+\.\d+\.\d+$/);
});

for (const flag of REMOVED_FLAGS) {
  test(`${flag} exits with a usage error instead of running`, () => {
    const proc = Bun.spawnSync(["bun", "src/cli.ts", flag]);
    expect(proc.exitCode).toBe(2);
    const err = new TextDecoder().decode(proc.stderr);
    expect(err).toContain("was removed");
  });
}

test("--publisher without --publish is a usage error", () => {
  const proc = Bun.spawnSync(["bun", "src/cli.ts", "--run", "echo hi", "--publisher", "gh"]);
  expect(proc.exitCode).toBe(2);
  expect(JSON.parse(new TextDecoder().decode(proc.stdout)).errors[0].message).toContain("--publisher only applies with --publish");
});

test("--help documents the config command and the publisher flag", () => {
  const proc = Bun.spawnSync(["bun", "src/cli.ts", "--help"]);
  const text = new TextDecoder().decode(proc.stdout);
  expect(text).toContain("termshot config set <key> <value>");
  expect(text).toContain("--publisher <name>");
  expect(text).toContain("pull request number, URL or branch");
  expect(text).not.toContain("--terminal");
  expect(text).not.toContain("--settle");
});

test("--cols and --rows stay null when not passed", () => {
  const r = parseFlags(["--run", "x"]);
  expect(r.ok && [r.invocation.cols, r.invocation.rows]).toEqual([null, null]);
});

test("--cols and --rows are read when passed", () => {
  const r = parseFlags(["--run", "x", "--cols", "80", "--rows", "10"]);
  expect(r.ok && [r.invocation.cols, r.invocation.rows]).toEqual([80, 10]);
});

test("help describes the headless model and names the config file and every key", () => {
  const help = helpText("0.7.0");
  expect(help).toContain("built-in headless terminal");
  expect(help).toContain(".termshot/config.json");
  expect(help).toContain(".termshot/captures/<timestamp>.png");
  for (const key of CONFIG_KEY_NAMES) expect(help).toContain(key);
});

test("an empty record has a null shell", () => {
  expect(buildResult({ tool: "termshot", version: "0", status: "usage-error" }).terminal).toEqual({ shell: null, cols: null, rows: null });
});

test("VERSION comes from package.json", () => {
  const raw = readFileSync(join(import.meta.dir, "..", "package.json"), "utf8");
  const declared = JSON.parse(raw).version;
  expect(VERSION).toBe(declared);
});

test("--cols, --rows and --publisher beat the config, which fills in what the flags leave out", () => {
  const config = effectiveConfig({ cols: 50, rows: 10, publisher: "rclone", theme: "light", "font.size": 22, "prompt.symbol": "$" });
  const both = parseFlags(["--run", "x", "--cols", "80", "--rows", "12", "--publish", "7", "--publisher", "gh"]);
  const neither = parseFlags(["--run", "x"]);
  if (!both.ok || !neither.ok) throw new Error("flags did not parse");

  const flagged = captureSettings(config, both.invocation);
  expect([flagged.cols, flagged.rows, flagged.publisher]).toEqual([80, 12, "gh"]);

  const configured = captureSettings(config, neither.invocation);
  expect([configured.cols, configured.rows, configured.publisher]).toEqual([50, 10, "rclone"]);
  expect(configured.theme).toBe(themeFor("light"));
  expect(configured.fontSize).toBe(22);
  expect(configured.prompt).toEqual({ show: true, directory: "full", git: true, symbol: "$" });
});

test("the prompt asks git for the branch only when the prompt is shown with git on", () => {
  const asked: string[][] = [];
  const git: GitRunner = (argv) => {
    asked.push(argv);
    return { exitCode: 0, stdout: "main\n" };
  };
  const options = { show: true, directory: "full", git: true, symbol: "❯" } as const;
  expect(promptContext("/p", "/h", { ...options, show: false }, git).gitBranch).toBeNull();
  expect(promptContext("/p", "/h", { ...options, git: false }, git).gitBranch).toBeNull();
  expect(asked).toEqual([]);
  expect(promptContext("/p", "/h", options, git)).toEqual({ cwd: "/p", home: "/h", gitBranch: "main" });
});

// A git repo with no .termshot/ yet, so a capture without -o would create one.
function bareRepo(): { repo: string; home: string } {
  const base = realpathSync(mkdtempSync(join(tmpdir(), "termshot-cli-")));
  const repo = join(base, "repo");
  const home = join(base, "home");
  mkdirSync(repo);
  mkdirSync(home);
  Bun.spawnSync(["git", "init", "-q", repo]);
  return { repo, home };
}

const CLI = join(import.meta.dir, "..", "src", "cli.ts");

test("a missing shell creates no .termshot/ and records the shell and command", () => {
  const { repo, home } = bareRepo();
  const bin = join(repo, "..", "bin");
  mkdirSync(bin);
  symlinkSync(Bun.which("git")!, join(bin, "git"));
  const proc = Bun.spawnSync([process.execPath, CLI, "--run", "echo hi"], { cwd: repo, env: { HOME: home, PATH: bin } });
  const record = JSON.parse(proc.stdout.toString());
  expect(record.status).toBe("environment-error");
  expect(record.errors[0].step).toBe("shell");
  expect(record.terminal.shell).toBe("zsh");
  expect(record.command.argv).toEqual(["echo hi"]);
  expect(existsSync(join(repo, ".termshot"))).toBe(false);
});

test.skipIf(process.getuid?.() === 0)("an unwritable project root is an environment error at step artifact with the full record", () => {
  const { repo, home } = bareRepo();
  chmodSync(repo, 0o555);
  try {
    const proc = Bun.spawnSync([process.execPath, CLI, "--run", "echo hi"], { cwd: repo, env: { ...process.env, HOME: home } });
    const record = JSON.parse(proc.stdout.toString());
    expect(record.status).toBe("environment-error");
    expect(record.errors[0].step).toBe("artifact");
    expect(record.terminal.shell).toBe("zsh");
    expect(record.command).toMatchObject({ argv: ["echo hi"], exitStatus: 0 });
    expect(proc.exitCode).toBe(3);
  } finally {
    chmodSync(repo, 0o755);
  }
});
