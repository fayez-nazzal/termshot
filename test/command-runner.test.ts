import { expect, test } from "bun:test";
import type { CommandRunResult } from "../src/command-run/command-runner.ts";
import { commandEnv } from "../src/command-run/environment.ts";
import { defaultCommandRunner } from "../src/command-run/registry.ts";
import { ptyCommandRunner } from "../src/command-run/pty.ts";
import type { SignalPort } from "../src/command-run/disposal.ts";
import { COMMAND_RUN_SETTINGS } from "../src/command-run/settings.ts";

const run = (cmd: string, timeoutMs = 60000) =>
  defaultCommandRunner().run({ argv: ["/bin/sh", "-c", cmd], cols: 80, rows: 24, env: commandEnv(process.env, "xterm-256color", 80, 24), cwd: process.cwd(), timeoutMs });
const text = (r: CommandRunResult) => new TextDecoder().decode(r.output);

test("captures output and exit status", async () => {
  const r = await run("echo hi; exit 3");
  expect(text(r)).toContain("hi");
  expect(r.exitStatus).toBe(3);
  expect(r.timedOut).toBe(false);
});

test("stdin is a tty and gets EOF, so cat finishes and nothing echoes", async () => {
  const r = await run("test -t 0 && echo tty; cat");
  expect(text(r)).toContain("tty");
  expect(text(r)).not.toContain("^D");
  expect(r.durationMs).toBeLessThan(2000);
});

test("a background child holding the pty does not block", async () => {
  const r = await run("sleep 30 & echo done");
  expect(text(r)).toContain("done");
  expect(r.durationMs).toBeLessThan(3000);
});

test("times out and kills the command", async () => {
  const r = await run("sleep 10", 300);
  expect(r).toMatchObject({ timedOut: true, exitStatus: null });
});

test("a command killed by a signal reports 128 + signal", async () => {
  expect((await run("kill -TERM $$")).exitStatus).toBe(143);
});

test("commandEnv forces color and disables pagers", () => {
  expect(commandEnv({ HOME: "/h", X: undefined }, "t", 100, 20)).toEqual({ HOME: "/h", TERM: "t", COLORTERM: "truecolor", FORCE_COLOR: "1", CLICOLOR_FORCE: "1", COLUMNS: "100", LINES: "20", PAGER: "cat", GIT_PAGER: "cat", MANPAGER: "cat" });
});

test("cols and rows default to 120 by 30 and must be positive integers", () => {
  expect([COMMAND_RUN_SETTINGS.cols.default, COMMAND_RUN_SETTINGS.rows.default]).toEqual([120, 30]);
  expect(COMMAND_RUN_SETTINGS.cols.parse("80")).toBe(80);
  expect(() => COMMAND_RUN_SETTINGS.rows.parse(0)).toThrow();
});

test("the runner stops listening for signals once the command is reaped", async () => {
  let listening = 0;
  const signals: SignalPort = {
    onExit: () => {
      listening = listening + 1;
      return () => {
        listening = listening - 1;
      };
    },
    onSignal: () => {
      listening = listening + 1;
      return () => {
        listening = listening - 1;
      };
    },
  };
  const r = await ptyCommandRunner(signals).run({ argv: ["/bin/sh", "-c", "echo hi"], cols: 80, rows: 24, env: commandEnv(process.env, "xterm-256color", 80, 24), cwd: process.cwd(), timeoutMs: 60000 });
  expect(r.exitStatus).toBe(0);
  expect(listening).toBe(0);
});

function capturingSignalPort() {
  const handlers = new Map<string, () => void>();
  const signals: SignalPort = {
    onExit: (handler) => {
      handlers.set("exit", handler);
      return () => handlers.delete("exit");
    },
    onSignal: (signal, handler) => {
      handlers.set(signal, handler);
      return () => handlers.delete(signal);
    },
  };
  return { signals, handlers };
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  test(`${signal} to termshot kills the command and reports the interrupt, not an exit status`, async () => {
    const { signals, handlers } = capturingSignalPort();
    const running = ptyCommandRunner(signals).run({ argv: ["/bin/sh", "-c", "sleep 10"], cols: 80, rows: 24, env: commandEnv(process.env, "xterm-256color", 80, 24), cwd: process.cwd(), timeoutMs: 60000 });
    await Bun.sleep(100);
    handlers.get(signal)!();
    const r = await running;
    expect(r).toMatchObject({ interrupted: signal, exitStatus: null, timedOut: false });
    expect(r.durationMs).toBeLessThan(3000);
    expect(handlers.size).toBe(0);
  });
}

test("a command that finishes on its own is not interrupted", async () => {
  expect((await run("echo hi")).interrupted).toBeNull();
});
