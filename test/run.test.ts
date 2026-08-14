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
      read: () => "0",
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
  const result = runTermshot("0.5.0", INVOCATION, "/fake/out.png", "/fake/out.status", ports, "termshot-test");

  expect(artifactMap.size).toBe(1);
  expect(artifactMap.has("/fake/out.png")).toBe(true);
  expect(result.capture.path).toBe("/fake/out.png");
  expect(result.capture.bytes).toBeGreaterThan(0);
  expect(result.errors[0]!.step).toBe("publish");
  expect(exitCodeFor(result)).toBe(6);
  expect(exitCodeFor(result)).not.toBe(1);
  expect(exitCodeFor(result)).not.toBe(3);
});

test("a child command exit code of 3 is reported as 3 in the result, not mistaken for a termshot environment error", () => {
  const artifactMap = new Map<string, Uint8Array>();
  const ports = fakePorts(artifactMap);
  const statusReads = ["", "3"];
  ports.statusStore.read = () => statusReads.shift() ?? "3";
  let elapsedMs = 0;
  ports.clock.now = () => elapsedMs;
  ports.clock.sleep = (ms: number) => {
    elapsedMs = elapsedMs + ms;
  };
  ports.publisher.publish = () => ({ url: "https://example.com/x.png", markdown: "![x](https://example.com/x.png)" });

  const result = runTermshot("0.5.0", { ...INVOCATION, publishDest: null }, "/fake/out.png", "/fake/out.status", ports, "termshot-test");

  expect(result.command.exitStatus).toBe(3);
  expect(result.status).toBe("command-failed");
  expect(result.command.timedOut).toBe(false);
  expect(exitCodeFor(result)).toBe(1);
  expect(exitCodeFor(result)).not.toBe(3);
});

test("the terminal block reports the grid the window was launched with", () => {
  const artifactMap = new Map<string, Uint8Array>();
  const ports = fakePorts(artifactMap);
  ports.publisher.publish = () => ({ url: "https://example.com/x", markdown: "![x](https://example.com/x)" });
  const result = runTermshot("0.5.0", INVOCATION, "/fake/out.png", "/fake/out.status", ports, "termshot-test");

  expect(result.terminal.cols).toBe(120);
  expect(result.terminal.rows).toBe(30);
  expect(Object.keys(result.terminal)).toEqual(["cols", "rows"]);
});
