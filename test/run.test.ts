import { expect, test } from "bun:test";
import { exitCodeFor } from "../src/run-result/exit-codes.ts";
import { runTermshot } from "../src/run.ts";
import type { CaptureSettings, RunPorts, RunSetup } from "../src/run.ts";
import type { Invocation } from "../src/invocation/invocation.ts";
import type { CommandRunResult, RunRequest } from "../src/command-run/command-runner.ts";
import type { Frame } from "../src/frame/frame.ts";
import type { Cell, Row } from "../src/terminal-emulation/terminal-emulator.ts";
import { themeFor } from "../src/theme/registry.ts";

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
  cols: null,
  rows: null,
  publishDest: "gdrive:PR-Shots/x/",
  publishSize: 2560,
  publishLabel: null,
  publisher: null,
};

const SETTINGS: CaptureSettings = {
  shell: "zsh",
  theme: themeFor("dark"),
  fontSize: 18,
  cols: 120,
  rows: 30,
  prompt: { show: true, directory: "full", git: true, symbol: "❯" },
  publisher: "gh",
};

function setup(invocation: Invocation = INVOCATION): RunSetup {
  return {
    version: "0.7.0",
    invocation,
    settings: SETTINGS,
    promptContext: { cwd: "/home/me/proj", home: "/home/me", gitBranch: "main" },
    env: { TERM: "fake" },
    cwd: "/home/me/proj",
    outputPath: "/fake/out.png",
  };
}

function outputRow(text: string): Row {
  return [...text].map(
    (char): Cell => ({ char, width: 1, fg: { kind: "default" }, bg: { kind: "default" }, bold: false, dim: false, italic: false, underline: false, inverse: false }),
  );
}

function ran(overrides: Partial<CommandRunResult> = {}): CommandRunResult {
  return { output: new TextEncoder().encode("hi\r\n"), exitStatus: 0, timedOut: false, durationMs: 12, interrupted: null, ...overrides };
}

interface Spies {
  artifacts: Map<string, Uint8Array>;
  requests: RunRequest[];
  frames: Frame[];
}

function fakePorts(spies: Spies = { artifacts: new Map(), requests: [], frames: [] }): RunPorts {
  return {
    shell: { argv: (command) => ["/bin/fake-shell", "-c", command] },
    runner: {
      run: async (request) => {
        spies.requests.push(request);
        return ran();
      },
    },
    emulator: { render: async () => [outputRow("hi")] },
    prompt: { segments: () => [{ text: "~/proj", role: "directory" }, { text: " ", role: "text" }] },
    highlighter: { tokenize: (command) => [{ text: command, role: "command" }] },
    renderer: {
      render: async (frame) => {
        spies.frames.push(frame);
        return PNG_MAGIC_PLUS_HEADER;
      },
    },
    artifacts: {
      write: (path, data) => {
        spies.artifacts.set(path, data);
        return { path, bytes: data.length, sha256: "fake" };
      },
    },
    publisher: {
      publish: () => {
        throw new Error("rclone copy failed: boom");
      },
    },
  };
}

function published(): RunPorts["publisher"] {
  return { publish: () => ({ url: "https://example.com/x.png", markdown: "![x](https://example.com/x.png)" }) };
}

test("a capture survives a failing downstream publish step", async () => {
  const spies: Spies = { artifacts: new Map(), requests: [], frames: [] };
  const result = await runTermshot(setup(), fakePorts(spies));

  expect(spies.artifacts.size).toBe(1);
  expect(spies.artifacts.has("/fake/out.png")).toBe(true);
  expect(result.capture.path).toBe("/fake/out.png");
  expect(result.capture.bytes).toBeGreaterThan(0);
  expect(result.errors[0]!.step).toBe("publish");
  expect(exitCodeFor(result)).toBe(6);
});

test("a child command exit code of 3 is reported as 3 in the result, not mistaken for a termshot environment error", async () => {
  const ports = fakePorts();
  ports.runner.run = async () => ran({ exitStatus: 3 });
  const result = await runTermshot(setup({ ...INVOCATION, publishDest: null }), ports);

  expect(result.command.exitStatus).toBe(3);
  expect(result.status).toBe("command-failed");
  expect(result.command.timedOut).toBe(false);
  expect(exitCodeFor(result)).toBe(1);
});

test("ok run records shell and rendered grid", async () => {
  const ports = fakePorts();
  ports.emulator.render = async () => [outputRow("one"), outputRow("two")];
  const result = await runTermshot(setup({ ...INVOCATION, publishDest: null }), ports);

  expect(result.status).toBe("ok");
  expect(result.terminal).toEqual({ shell: "zsh", cols: 120, rows: 3 });
  expect(result.capture).toEqual({ path: "/fake/out.png", bytes: PNG_MAGIC_PLUS_HEADER.length, sha256: "fake", width: 10, height: 5 });
  expect(result.command).toEqual({ argv: ["echo hi"], exitStatus: 0, durationMs: 12, timedOut: false });
});

test("the runner gets the shell argv, grid, env, cwd and the 60 s timeout", async () => {
  const spies: Spies = { artifacts: new Map(), requests: [], frames: [] };
  await runTermshot(setup({ ...INVOCATION, publishDest: null }), fakePorts(spies));
  expect(spies.requests).toEqual([{ argv: ["/bin/fake-shell", "-c", "echo hi"], cols: 120, rows: 30, env: { TERM: "fake" }, cwd: "/home/me/proj", timeoutMs: 60000 }]);
});

test("missing shell is an environment error at step shell, nothing written", async () => {
  const spies: Spies = { artifacts: new Map(), requests: [], frames: [] };
  const ports = fakePorts(spies);
  ports.shell.argv = () => {
    throw new Error("zsh was not found on PATH");
  };
  const result = await runTermshot(setup(), ports);

  expect(result.status).toBe("environment-error");
  expect(result.errors).toEqual([{ step: "shell", message: "zsh was not found on PATH" }]);
  expect(result.terminal).toEqual({ shell: "zsh", cols: null, rows: null });
  expect(result.command).toEqual({ argv: ["echo hi"], exitStatus: null, durationMs: null, timedOut: false });
  expect(result.publish).toEqual({ requested: true, publisher: "gh", url: null, markdown: null, verified: false });
  expect(spies.requests).toEqual([]);
  expect(spies.artifacts.size).toBe(0);
});

test("a runner that cannot start is an environment error at step command-run", async () => {
  const spies: Spies = { artifacts: new Map(), requests: [], frames: [] };
  const ports = fakePorts(spies);
  ports.runner.run = async () => {
    throw new Error("posix_spawn failed");
  };
  const result = await runTermshot(setup(), ports);

  expect(result.status).toBe("environment-error");
  expect(result.errors).toEqual([{ step: "command-run", message: "posix_spawn failed" }]);
  expect(result.command.argv).toEqual(["echo hi"]);
  expect(spies.artifacts.size).toBe(0);
});

test("timeout writes nothing and reports null grid", async () => {
  const spies: Spies = { artifacts: new Map(), requests: [], frames: [] };
  const ports = fakePorts(spies);
  ports.runner.run = async () => ran({ exitStatus: null, timedOut: true, durationMs: 60004 });
  const result = await runTermshot(setup(), ports);

  expect(result.status).toBe("timeout");
  expect(exitCodeFor(result)).toBe(4);
  expect(result.command).toEqual({ argv: ["echo hi"], exitStatus: null, durationMs: 60004, timedOut: true });
  expect(result.errors).toEqual([{ step: "command-run", message: "command did not finish within 60000ms" }]);
  expect(result.terminal).toEqual({ shell: "zsh", cols: null, rows: null });
  expect(result.capture.path).toBeNull();
  expect(spies.artifacts.size).toBe(0);
  expect(spies.frames).toEqual([]);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  test(`an interrupt by ${signal} renders, writes and publishes nothing, and is an environment error`, async () => {
    const spies: Spies = { artifacts: new Map(), requests: [], frames: [] };
    const ports = fakePorts(spies);
    let publishes = 0;
    ports.publisher.publish = (request) => {
      publishes = publishes + 1;
      return published().publish(request);
    };
    ports.runner.run = async () => ran({ exitStatus: null, durationMs: 840, interrupted: signal });
    const result = await runTermshot(setup(), ports);

    expect(result.status).toBe("environment-error");
    expect(exitCodeFor(result)).toBe(3);
    expect(result.errors).toEqual([{ step: "command-run", message: `interrupted by ${signal}` }]);
    expect(result.command).toEqual({ argv: ["echo hi"], exitStatus: null, durationMs: 840, timedOut: false });
    expect(result.terminal).toEqual({ shell: "zsh", cols: null, rows: null });
    expect(result.capture.path).toBeNull();
    expect(result.publish).toEqual({ requested: true, publisher: "gh", url: null, markdown: null, verified: false });
    expect(spies.frames).toEqual([]);
    expect(spies.artifacts.size).toBe(0);
    expect(publishes).toBe(0);
  });
}

test("an interrupt that lands after the timeout still reports the interrupt", async () => {
  const ports = fakePorts();
  ports.runner.run = async () => ran({ exitStatus: null, timedOut: true, durationMs: 60100, interrupted: "SIGINT" });
  const result = await runTermshot(setup(), ports);
  expect(result.status).toBe("environment-error");
  expect(result.errors).toEqual([{ step: "command-run", message: "interrupted by SIGINT" }]);
});

test("an emulator failure is internal-error at step terminal-emulation, command status kept", async () => {
  const spies: Spies = { artifacts: new Map(), requests: [], frames: [] };
  const ports = fakePorts(spies);
  ports.emulator.render = async () => {
    throw new Error("parser exploded");
  };
  const result = await runTermshot(setup(), ports);

  expect(result.status).toBe("internal-error");
  expect(result.errors).toEqual([{ step: "terminal-emulation", message: "parser exploded" }]);
  expect(result.command.exitStatus).toBe(0);
  expect(result.command.durationMs).toBe(12);
  expect(result.terminal).toEqual({ shell: "zsh", cols: null, rows: null });
  expect(spies.artifacts.size).toBe(0);
});

test("render failure is internal-error, no artifact, command status kept", async () => {
  const spies: Spies = { artifacts: new Map(), requests: [], frames: [] };
  const ports = fakePorts(spies);
  ports.runner.run = async () => ran({ exitStatus: 2 });
  ports.renderer.render = async () => {
    throw new Error("rasterize failed");
  };
  const result = await runTermshot(setup(), ports);

  expect(result.status).toBe("internal-error");
  expect(exitCodeFor(result)).toBe(7);
  expect(result.errors).toEqual([{ step: "rendering", message: "rasterize failed" }]);
  expect(result.command).toEqual({ argv: ["echo hi"], exitStatus: 2, durationMs: 12, timedOut: false });
  expect(result.terminal).toEqual({ shell: "zsh", cols: null, rows: null });
  expect(result.capture.path).toBeNull();
  expect(spies.artifacts.size).toBe(0);
});

test("unwritable output is environment-error at step artifact", async () => {
  const ports = fakePorts();
  ports.artifacts.write = () => {
    throw new Error("EACCES: permission denied, mkdir '/fake'");
  };
  const result = await runTermshot(setup(), ports);

  expect(result.status).toBe("environment-error");
  expect(exitCodeFor(result)).toBe(3);
  expect(result.errors).toEqual([{ step: "artifact", message: "EACCES: permission denied, mkdir '/fake'" }]);
  expect(result.terminal).toEqual({ shell: "zsh", cols: 120, rows: 2 });
  expect(result.command.exitStatus).toBe(0);
  expect(result.capture.path).toBeNull();
  expect(result.publish).toEqual({ requested: true, publisher: "gh", url: null, markdown: null, verified: false });
});

test("an unreadable PNG header is internal-error at step artifact, but a failed command wins", async () => {
  const ports = fakePorts();
  ports.renderer.render = async () => new Uint8Array([1, 2, 3]);
  const ok = await runTermshot(setup({ ...INVOCATION, publishDest: null }), ports);
  expect(ok.status).toBe("internal-error");
  expect(ok.errors[0]!.step).toBe("artifact");
  expect(ok.capture.path).toBe("/fake/out.png");
  expect([ok.capture.width, ok.capture.height]).toEqual([null, null]);

  ports.runner.run = async () => ran({ exitStatus: 1 });
  const failed = await runTermshot(setup({ ...INVOCATION, publishDest: null }), ports);
  expect(failed.status).toBe("command-failed");
  expect(failed.errors[0]!.step).toBe("artifact");
});

test("the frame gets prompt segments and highlighted command tokens", async () => {
  const spies: Spies = { artifacts: new Map(), requests: [], frames: [] };
  const ports = fakePorts(spies);
  const themes: unknown[] = [];
  const sizes: number[] = [];
  const contexts: unknown[] = [];
  const render = ports.renderer.render;
  ports.renderer.render = async (frame, theme, fontSize) => {
    themes.push(theme);
    sizes.push(fontSize);
    return render(frame, theme, fontSize);
  };
  ports.prompt.segments = (context, options) => {
    contexts.push([context, options]);
    return [{ text: "~/proj", role: "directory" }, { text: " ", role: "text" }];
  };
  await runTermshot(setup({ ...INVOCATION, publishDest: null }), ports);

  expect(spies.frames.length).toBe(1);
  const frame = spies.frames[0]!;
  const line = (row: number) => frame.rows[row]!.map((cell) => cell.char).join("");
  expect(frame.cols).toBe(120);
  expect(line(0).startsWith("~/proj echo hi")).toBe(true);
  expect(frame.rows[0]![0]!.fg).toEqual({ kind: "prompt", role: "directory" });
  expect(frame.rows[0]![7]!.fg).toEqual({ kind: "highlight", role: "command" });
  expect(line(1)).toBe("hi");
  expect(contexts).toEqual([[setup().promptContext, SETTINGS.prompt]]);
  expect(themes).toEqual([SETTINGS.theme]);
  expect(sizes).toEqual([18]);
});

test("the publisher gets the written artifact's path and sha256, and the record names the publisher", async () => {
  const ports = fakePorts();
  const requests: unknown[] = [];
  ports.publisher.publish = (request) => {
    requests.push(request);
    return published().publish(request);
  };
  const result = await runTermshot(setup(), ports);
  expect(requests).toEqual([{ filePath: "/fake/out.png", sha256: "fake", dest: "gdrive:PR-Shots/x/", size: 2560, label: "/fake/out.png" }]);
  expect(result.publish).toEqual({ requested: true, publisher: "gh", url: "https://example.com/x.png", markdown: "![x](https://example.com/x.png)", verified: true });
});

test("without --publish the record names no publisher", async () => {
  const result = await runTermshot(setup({ ...INVOCATION, publishDest: null }), fakePorts());
  expect(result.publish.publisher).toBeNull();
  expect(result.publish.requested).toBe(false);
});
