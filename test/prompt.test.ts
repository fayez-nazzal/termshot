import { expect, test } from "bun:test";
import { liveGitRunner, readGitBranch } from "../src/prompt/context.ts";
import type { PromptOptions, PromptSegment } from "../src/prompt/prompt.ts";
import { defaultPrompt } from "../src/prompt/registry.ts";
import { PROMPT_SETTINGS } from "../src/prompt/settings.ts";

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
  expect(
    readGitBranch("/x", (a) =>
      a.includes("symbolic-ref") ? { exitCode: 1, stdout: "" } : { exitCode: 0, stdout: "abc1234\n" },
    ),
  ).toBe("abc1234");
  expect(readGitBranch("/x", () => ({ exitCode: 0, stdout: "main\n" }))).toBe("main");
  expect(readGitBranch("/x", () => ({ exitCode: 128, stdout: "" }))).toBeNull();
});

test("prompt settings", () => {
  expect(Object.keys(PROMPT_SETTINGS)).toEqual(["prompt.show", "prompt.directory", "prompt.git", "prompt.symbol"]);
  expect(PROMPT_SETTINGS["prompt.symbol"].default).toBe("❯");
  expect(PROMPT_SETTINGS["prompt.directory"].parse("short")).toBe("short");
  expect(() => PROMPT_SETTINGS["prompt.directory"].parse("x")).toThrow();
  expect(PROMPT_SETTINGS["prompt.show"].parse("false")).toBe(false);
  expect(PROMPT_SETTINGS["prompt.symbol"].parse("🙂🙂🙂🙂")).toBe("🙂🙂🙂🙂");
  expect(() => PROMPT_SETTINGS["prompt.symbol"].parse("")).toThrow("prompt.symbol");
  expect(() => PROMPT_SETTINGS["prompt.symbol"].parse("abcde")).toThrow("at most 4");
  expect(() => PROMPT_SETTINGS["prompt.symbol"].parse(5)).toThrow("prompt.symbol");
});

test("liveGitRunner reads the branch of this repo and never throws outside one", () => {
  expect(typeof readGitBranch(import.meta.dir, liveGitRunner)).toBe("string");
  expect(readGitBranch("/", liveGitRunner)).toBeNull();
  expect(liveGitRunner(["git", "--version"], "/nonexistent-dir-xyz")).toBeNull();
});
