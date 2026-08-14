import { expect, test } from "bun:test";
import { cleanshotAnnotateUrl, clipboardScript, DEFAULT_RUN_COLS, DEFAULT_RUN_ROWS, VERSION } from "../src/cli.ts";

test("VERSION is a semver string", () => {
  expect(VERSION).toMatch(/^\d+\.\d+\.\d+$/);
});

test("default --run grid is wide enough to render wider than tall", () => {
  expect(DEFAULT_RUN_COLS).toBe(120);
  expect(DEFAULT_RUN_ROWS).toBe(30);
  expect(DEFAULT_RUN_COLS).toBeGreaterThanOrEqual(DEFAULT_RUN_ROWS * 4);
});

test("cleanshotAnnotateUrl URL-encodes the file path", () => {
  const url = cleanshotAnnotateUrl("/tmp/my shot.png");
  expect(url).toBe("cleanshot://open-annotate?filepath=%2Ftmp%2Fmy%20shot.png");
});

test("clipboardScript embeds the path and escapes quotes", () => {
  expect(clipboardScript("/tmp/shot.png")).toBe('set the clipboard to (read (POSIX file "/tmp/shot.png") as «class PNGf»)');
  expect(clipboardScript('/tmp/a"b.png')).toContain('POSIX file "/tmp/a\\"b.png"');
});
