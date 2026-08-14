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

test("capture.ts never invokes screencapture's interactive window picker", () => {
  const text = readFileSync(join(import.meta.dir, "..", "src", "capture.ts"), "utf8");
  expect(text).not.toContain("resolveWindowId");
  expect(text).not.toMatch(/args\.push\("-w"\)/);
});

test("VERSION comes from package.json", () => {
  const raw = readFileSync(join(import.meta.dir, "..", "package.json"), "utf8");
  const declared = JSON.parse(raw).version;
  expect(VERSION).toBe(declared);
});
