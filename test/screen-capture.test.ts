import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { captureWindow } from "../src/screen-capture/screen-capture.ts";

test.skipIf(process.platform === "darwin")("captureWindow throws on unsupported platforms", () => {
  expect(() => captureWindow(1)).toThrow(/not supported/);
});

test("screen capture never invokes screencapture's interactive window picker", () => {
  const text = readFileSync(join(import.meta.dir, "..", "src", "screen-capture", "screen-capture.ts"), "utf8");
  expect(text).toContain('"-l"');
  expect(text).not.toContain('"-w"');
  expect(text).not.toContain('"-i"');
});
