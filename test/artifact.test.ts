import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeArtifact, writeNewArtifact } from "../src/artifact/artifact.ts";
import { pngHeader } from "../src/artifact/png-header.ts";

const PNG_HEAD = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0x0f, 0x20, 0, 0, 0x04, 0x38]);

test("writeArtifact creates missing folders and records the bytes and sha256 written", () => {
  const path = join(mkdtempSync(join(tmpdir(), "termshot-artifact-")), "a", "b", "out.png");
  const record = writeArtifact(path, PNG_HEAD);
  expect(record).toEqual({ path, bytes: PNG_HEAD.length, sha256: createHash("sha256").update(PNG_HEAD).digest("hex") });
  expect(new Uint8Array(readFileSync(path))).toEqual(PNG_HEAD);
});

test("writeArtifact replaces a file already at the path", () => {
  const path = join(mkdtempSync(join(tmpdir(), "termshot-artifact-")), "out.png");
  writeArtifact(path, new Uint8Array([1]));
  expect(writeArtifact(path, PNG_HEAD).path).toBe(path);
  expect(new Uint8Array(readFileSync(path))).toEqual(PNG_HEAD);
});

test("writeNewArtifact never replaces a file: a taken name gets -1, -2, ... and the record names the file written", () => {
  const dir = join(mkdtempSync(join(tmpdir(), "termshot-artifact-")), "captures");
  const path = join(dir, "20261116-090507-042.png");
  const first = new Uint8Array([1]);
  const records = [first, new Uint8Array([2]), new Uint8Array([3])].map((data) => writeNewArtifact(path, data));
  expect(records.map((r) => r.path)).toEqual([path, join(dir, "20261116-090507-042-1.png"), join(dir, "20261116-090507-042-2.png")]);
  expect(records[0]!.sha256).toBe(createHash("sha256").update(first).digest("hex"));
  expect(new Uint8Array(readFileSync(path))).toEqual(first);
  expect(new Uint8Array(readFileSync(records[2]!.path))).toEqual(new Uint8Array([3]));
  expect(readdirSync(dir).length).toBe(3);
});

test("writeNewArtifact passes on errors other than a taken name", () => {
  const file = join(mkdtempSync(join(tmpdir(), "termshot-artifact-")), "plain-file");
  writeArtifact(file, new Uint8Array([1]));
  expect(() => writeNewArtifact(join(file, "out.png"), PNG_HEAD)).toThrow();
});

test("pngHeader reads the width and height from the IHDR chunk", () => {
  expect(pngHeader(PNG_HEAD)).toEqual({ width: 3872, height: 1080 });
});

test("pngHeader rejects bytes without the PNG magic", () => {
  expect(() => pngHeader(new Uint8Array([1, 2, 3]))).toThrow("not a PNG");
});
