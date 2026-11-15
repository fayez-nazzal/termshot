import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { VERSION } from "../src/cli.ts";
import { CONFIG_KEY_NAMES } from "../src/configuration/config.ts";
import { parseFlags } from "../src/invocation/flags.ts";
import { helpText } from "../src/invocation/help.ts";
import { buildResult } from "../src/run-result/build.ts";

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
