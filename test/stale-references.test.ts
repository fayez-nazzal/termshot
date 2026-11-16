import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const SELF = "test/stale-references.test.ts";
const SKIPPED_FOLDERS = ["docs/superpowers/", "assets/fonts/"];

const NAMES = /ghostty|alacritty|screencapture|screen recording/i;
const FLAGS = /--settle\b|--terminal\b/;
const WINDOW = /\b(terminal|new|fresh|the|a) window\b|\bwindow (manager|title|id)s?\b/i;

function trackedFiles(): string[] {
  const listed = Bun.spawnSync(["git", "ls-files"], { cwd: ROOT, stdout: "pipe" });
  expect(listed.exitCode).toBe(0);
  const files = listed.stdout
    .toString()
    .split("\n")
    .filter((path) => path !== "");
  expect(files.length).toBeGreaterThan(0);
  return files.filter((path) => path !== SELF).filter((path) => !SKIPPED_FOLDERS.some((folder) => path.startsWith(folder)));
}

function isBinary(bytes: Buffer): boolean {
  return bytes.includes(0);
}

function isStale(line: string): boolean {
  const namesOldFlag = FLAGS.test(line) && !/removed/i.test(line);
  return NAMES.test(line) || namesOldFlag || WINDOW.test(line);
}

function staleLines(path: string): string[] {
  const bytes = readFileSync(join(ROOT, path));
  let result: string[] = [];
  if (!isBinary(bytes)) {
    result = bytes
      .toString("utf8")
      .split("\n")
      .flatMap((line, index) => (isStale(line) ? [`${path}:${index + 1}: ${line.trim()}`] : []));
  }
  return result;
}

// The terminal-app backend is gone. No tracked file may still describe it.
test("no tracked file mentions the old terminal-app backend", () => {
  expect(trackedFiles().flatMap(staleLines)).toEqual([]);
});
