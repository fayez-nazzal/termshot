import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { VERSION, captureSettings } from "../src/cli.ts";
import { CONFIG_KEY_NAMES, effectiveConfig } from "../src/configuration/config.ts";
import { parseFlags } from "../src/invocation/flags.ts";
import { helpText } from "../src/invocation/help.ts";
import { buildResult } from "../src/run-result/build.ts";
import { themeFor } from "../src/theme/registry.ts";

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
