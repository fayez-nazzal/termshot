import { expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { configPathFor, defaultCapturePath, ensureTermshotDir, findProjectRoot, liveProjectProbe } from "../src/configuration/project.ts";
import type { ProjectProbe } from "../src/configuration/project.ts";

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), "termshot-project-test-"));
}

function probe(gitTopLevel: string | null): ProjectProbe {
  return { exists: existsSync, gitTopLevel: () => gitTopLevel };
}

test("nearest .termshot wins over git top-level", () => {
  const tmp = tempDir();
  mkdirSync(join(tmp, "a", ".termshot"), { recursive: true });
  mkdirSync(join(tmp, "a", "b"));
  expect(findProjectRoot(join(tmp, "a", "b"), probe(tmp))).toBe(join(tmp, "a"));
});

test("the cwd itself counts when it holds .termshot", () => {
  const tmp = tempDir();
  mkdirSync(join(tmp, ".termshot"));
  expect(findProjectRoot(tmp, probe(null))).toBe(tmp);
});

test("falls back to git top-level, then null", () => {
  const tmp = tempDir();
  expect(findProjectRoot(tmp, probe("/repo"))).toBe("/repo");
  expect(findProjectRoot(tmp, probe(null))).toBeNull();
});

test("configPathFor points into the project's .termshot folder", () => {
  expect(configPathFor("/p")).toBe("/p/.termshot/config.json");
});

test("ensureTermshotDir creates .gitignore once and never overwrites it", () => {
  const tmp = tempDir();
  const dir = ensureTermshotDir(tmp);
  expect(dir).toBe(join(tmp, ".termshot"));
  expect(readFileSync(join(dir, ".gitignore"), "utf8")).toBe("captures/\n");
  writeFileSync(join(dir, ".gitignore"), "custom\n");
  expect(ensureTermshotDir(tmp)).toBe(dir);
  expect(readFileSync(join(dir, ".gitignore"), "utf8")).toBe("custom\n");
});

test("ensureTermshotDir leaves an existing folder without a .gitignore alone", () => {
  const tmp = tempDir();
  mkdirSync(join(tmp, ".termshot"));
  ensureTermshotDir(tmp);
  expect(existsSync(join(tmp, ".termshot", ".gitignore"))).toBe(false);
});

test("the live probe counts only a .termshot folder, not a plain file", () => {
  const tmp = tempDir();
  writeFileSync(join(tmp, ".termshot"), "");
  expect(liveProjectProbe.exists(join(tmp, ".termshot"))).toBe(false);
  expect(findProjectRoot(tmp, liveProjectProbe)).toBeNull();
  const other = tempDir();
  mkdirSync(join(other, ".termshot"));
  expect(liveProjectProbe.exists(join(other, ".termshot"))).toBe(true);
  expect(liveProjectProbe.exists(join(other, "missing"))).toBe(false);
});

test("the live probe asks git for the top-level and gives null outside a repo", () => {
  const repo = join(import.meta.dir, "..");
  expect(liveProjectProbe.gitTopLevel(join(repo, "src"))).toBe(realpathSync(repo));
  expect(liveProjectProbe.gitTopLevel(tempDir())).toBeNull();
});

test("default capture path inside and outside a project", () => {
  expect(defaultCapturePath("/p", "/h", "20261115-101010")).toBe("/p/.termshot/captures/20261115-101010.png");
  expect(defaultCapturePath(null, "/h", "20261115-101010")).toBe("/h/termshot/20261115-101010.png");
});
