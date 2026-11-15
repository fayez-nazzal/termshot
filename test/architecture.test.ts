import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { PUBLISHER_IDS, publisherFor } from "../src/publishing/registry.ts";
import { TERMINAL_IDS, terminalEmulator } from "../src/terminal-emulator/registry.ts";

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
test("no source file outside src/terminal-emulator/ names a specific terminal", () => {
  const names = TERMINAL_IDS.flatMap((id) => [id, terminalEmulator(id).displayName]);
  expect(offenders("terminal-emulator", names)).toEqual([]);
});

test("no source file outside src/publishing/ names a specific publisher", () => {
  const names = PUBLISHER_IDS.flatMap((id) => [id, publisherFor(id).displayName, "Google Drive", "GitHub"]);
  expect(offenders("publishing", names)).toEqual([]);
});
