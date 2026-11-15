import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeArtifact } from "../src/artifact/artifact.ts";
import { pngHeader } from "../src/artifact/png-header.ts";

const PNG_HEAD = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0x0f, 0x20, 0, 0, 0x04, 0x38]);

test("writeArtifact creates missing folders and records the bytes and sha256 written", () => {
  const path = join(mkdtempSync(join(tmpdir(), "termshot-artifact-")), "a", "b", "out.png");
  const record = writeArtifact(path, PNG_HEAD);
  expect(record).toEqual({ path, bytes: PNG_HEAD.length, sha256: createHash("sha256").update(PNG_HEAD).digest("hex") });
  expect(new Uint8Array(readFileSync(path))).toEqual(PNG_HEAD);
});

test("pngHeader reads the width and height from the IHDR chunk", () => {
  expect(pngHeader(PNG_HEAD)).toEqual({ width: 3872, height: 1080 });
});

test("pngHeader rejects bytes without the PNG magic", () => {
  expect(() => pngHeader(new Uint8Array([1, 2, 3]))).toThrow("not a PNG");
});
