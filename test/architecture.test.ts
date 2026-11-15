import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { PUBLISHER_IDS, publisherFor } from "../src/publishing/registry.ts";
import { SHELL_IDS } from "../src/shell/registry.ts";

const SRC = join(import.meta.dir, "..", "src");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    let files: string[] = [];
    if (entry.isDirectory()) {
      files = sourceFiles(path);
    } else if (entry.name.endsWith(".ts")) {
      files = [path];
    }
    return files;
  });
}

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function offenders(owner: string, names: string[]): string[] {
  const pattern = new RegExp(names.map((name) => `\\b${escape(name)}\\b`).join("|"), "i");
  const ownerDir = join(SRC, owner);
  return sourceFiles(SRC)
    .filter((path) => !path.startsWith(ownerDir))
    .filter((path) => pattern.test(readFileSync(path, "utf8")))
    .map((path) => relative(SRC, path));
}

// Each adapter set is the single source of truth for its vendors. No other
// source file may name one.
test("no source file outside src/shell/ names a specific shell", () => {
  expect(offenders("shell", SHELL_IDS)).toEqual([]);
});

test("no source file outside src/terminal-emulation/ names the emulator library", () => {
  expect(offenders("terminal-emulation", ["xterm"])).toEqual([]);
});

test("no source file outside src/rendering/ names the rasterizer or the font", () => {
  expect(offenders("rendering", ["resvg", "JetBrains", "JetBrainsMono"])).toEqual([]);
});

test("no source file outside src/publishing/ names a specific publisher", () => {
  const names = PUBLISHER_IDS.flatMap((id) => [id, publisherFor(id).displayName, "Google Drive", "GitHub"]);
  expect(offenders("publishing", names)).toEqual([]);
});
