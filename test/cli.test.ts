import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_RUN_COLS, DEFAULT_RUN_ROWS, VERSION } from "../src/cli.ts";

const REMOVED_FLAGS = ["--annotate", "--copy", "--window-pick", "--box", "--marker", "--list", "--window", "--stdout"];

test("VERSION is a semver string", () => {
  expect(VERSION).toMatch(/^\d+\.\d+\.\d+$/);
});

test("default --run grid is wide enough to render wider than tall", () => {
  expect(DEFAULT_RUN_COLS).toBe(120);
  expect(DEFAULT_RUN_ROWS).toBe(30);
  expect(DEFAULT_RUN_COLS).toBeGreaterThanOrEqual(DEFAULT_RUN_ROWS * 4);
});

for (const flag of REMOVED_FLAGS) {
  test(`${flag} exits with a usage error instead of running`, () => {
    const proc = Bun.spawnSync(["bun", "src/cli.ts", flag]);
    expect(proc.exitCode).toBe(2);
    const err = new TextDecoder().decode(proc.stderr);
    expect(err).toContain("was removed");
  });
}

test("--terminal with an unsupported name exits with a usage error listing the supported terminals", () => {
  const proc = Bun.spawnSync(["bun", "src/cli.ts", "--run", "echo hi", "--terminal", "kitty"]);
  expect(proc.exitCode).toBe(2);
  const record = JSON.parse(new TextDecoder().decode(proc.stdout));
  expect(record.status).toBe("usage-error");
  expect(record.errors[0].message).toContain("supported terminals: ghostty, alacritty");
});

test("--publisher without --publish is a usage error", () => {
  const proc = Bun.spawnSync(["bun", "src/cli.ts", "--run", "echo hi", "--publisher", "gh"]);
  expect(proc.exitCode).toBe(2);
  expect(JSON.parse(new TextDecoder().decode(proc.stdout)).errors[0].message).toContain("--publisher only applies with --publish");
});

test("--help documents --terminal and the config command", () => {
  const proc = Bun.spawnSync(["bun", "src/cli.ts", "--help"]);
  const text = new TextDecoder().decode(proc.stdout);
  expect(text).toContain("--terminal <name>");
  expect(text).toContain("termshot config set <key> <value>");
  expect(text).toContain("ghostty, alacritty");
  expect(text).toContain("--publisher <name>");
  expect(text).toContain("pull request number, URL or branch");
});

test("VERSION comes from package.json", () => {
  const raw = readFileSync(join(import.meta.dir, "..", "package.json"), "utf8");
  const declared = JSON.parse(raw).version;
  expect(VERSION).toBe(declared);
});
