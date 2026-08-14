import { expect, test } from "bun:test";
import { exitCodeFor } from "../src/run-result/exit-codes.ts";
import { runTermshot } from "../src/run.ts";
import type { RunPorts } from "../src/run.ts";
import type { Invocation } from "../src/invocation/invocation.ts";

const PNG_MAGIC_PLUS_HEADER = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // magic
  0, 0, 0, 13, // IHDR length (unused by pngHeader)
  0x49, 0x48, 0x44, 0x52, // "IHDR"
  0, 0, 0, 10, // width = 10
  0, 0, 0, 5, // height = 5
]);

const INVOCATION: Invocation = {
  command: "echo hi",
  output: "/fake/out.png",
  settleMs: 0,
  cols: 120,
  rows: 30,
  publishDest: "gdrive:PR-Shots/x/",
  publishSize: 2560,
  publishLabel: null,
};

function fakePorts(artifactMap: Map<string, Uint8Array>): RunPorts {
  return {
    session: {
      launch: () => 4242,
      dispose: () => {},
    },
    windows: {
      waitForWindow: () => 1,
    },
    capture: {
      grab: () => PNG_MAGIC_PLUS_HEADER,
    },
    artifacts: {
      write: (path, data) => {
        artifactMap.set(path, data);
        return { path, bytes: data.length, sha256: "fake" };
      },
    },
    statusStore: {
      read: () => "",
    },
    clock: {
      now: () => 0,
      sleep: () => {},
    },
    publisher: {
      publish: () => {
        throw new Error("rclone copy failed: boom");
      },
    },
  };
}

test("a capture survives a failing downstream publish step", () => {
  const artifactMap = new Map<string, Uint8Array>();
  const ports = fakePorts(artifactMap);
  const result = runTermshot("0.5.0", INVOCATION, "/fake/out.png", ports, "termshot-test");

  expect(artifactMap.size).toBe(1);
  expect(artifactMap.has("/fake/out.png")).toBe(true);
  expect(result.capture.path).toBe("/fake/out.png");
  expect(result.capture.bytes).toBeGreaterThan(0);
  expect(result.errors[0]!.step).toBe("publish");
  expect(exitCodeFor(result)).toBe(6);
  expect(exitCodeFor(result)).not.toBe(1);
  expect(exitCodeFor(result)).not.toBe(3);
});
