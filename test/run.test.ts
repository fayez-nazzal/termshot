import { expect, test } from "bun:test";
import { exitCodeFor } from "../src/run-result/exit-codes.ts";
import { runTermshot } from "../src/run.ts";
import type { RunPorts, RunSetup } from "../src/run.ts";
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
  terminal: null,
  publisher: null,
};

function setup(invocation: Invocation = INVOCATION): RunSetup {
  return { version: "0.5.0", invocation, terminal: "alacritty", publisher: "gh", outputPath: "/fake/out.png", statusPath: "/fake/out.status", title: "termshot-test" };
}

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
  const result = runTermshot(setup(), ports);

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

  const result = runTermshot(setup({ ...INVOCATION, publishDest: null }), ports);

  expect(result.command.exitStatus).toBe(3);
  expect(result.status).toBe("command-failed");
  expect(result.command.timedOut).toBe(false);
  expect(exitCodeFor(result)).toBe(1);
  expect(exitCodeFor(result)).not.toBe(3);
});

test("the terminal block reports the emulator and the grid the window was launched with", () => {
  const artifactMap = new Map<string, Uint8Array>();
  const ports = fakePorts(artifactMap);
  ports.publisher.publish = () => ({ url: "https://example.com/x", markdown: "![x](https://example.com/x)" });
  const result = runTermshot(setup(), ports);

  expect(result.terminal.cols).toBe(120);
  expect(result.terminal.rows).toBe(30);
  expect(result.terminal.emulator).toBe("alacritty");
  expect(Object.keys(result.terminal)).toEqual(["emulator", "cols", "rows"]);
});

test("the publisher gets the written artifact's path and sha256, and the record names the publisher", () => {
  const ports = fakePorts(new Map());
  const requests: unknown[] = [];
  ports.publisher.publish = (request) => {
    requests.push(request);
    return { url: "https://example.com/x.png", markdown: "![x](https://example.com/x.png)" };
  };
  const result = runTermshot(setup(), ports);
  expect(requests).toEqual([{ filePath: "/fake/out.png", sha256: "fake", dest: "gdrive:PR-Shots/x/", size: 2560, label: "/fake/out.png" }]);
  expect(result.publish).toEqual({ requested: true, publisher: "gh", url: "https://example.com/x.png", markdown: "![x](https://example.com/x.png)", verified: true });
});

test("without --publish the record names no publisher", () => {
  const ports = fakePorts(new Map());
  const result = runTermshot(setup({ ...INVOCATION, publishDest: null }), ports);
  expect(result.publish.publisher).toBeNull();
  expect(result.publish.requested).toBe(false);
});

test("the session is launched with a terminal-neutral spec built from the invocation", () => {
  const ports = fakePorts(new Map());
  ports.publisher.publish = () => ({ url: "https://example.com/x", markdown: "![x](https://example.com/x)" });
  const specs: unknown[] = [];
  ports.session.launch = (spec) => {
    specs.push(spec);
    return 1;
  };
  runTermshot(setup({ ...INVOCATION, cols: 80, rows: 20 }), ports);
  expect(specs).toEqual([{ title: "termshot-test", script: expect.stringContaining("echo hi; echo $? > \"/fake/out.status\""), cols: 80, rows: 20 }]);
});

test("a launch failure still names the emulator, so the agent knows which terminal failed", () => {
  const ports = fakePorts(new Map());
  ports.session.launch = () => {
    throw new Error("Alacritty is not installed");
  };
  const result = runTermshot(setup(), ports);
  expect(result.status).toBe("environment-error");
  expect(result.terminal).toEqual({ emulator: "alacritty", cols: null, rows: null });
  expect(result.errors[0]!.step).toBe("terminal-session");
});
