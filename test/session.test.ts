import { expect, test } from "bun:test";
import { idempotentDisposer, launchSession, registerSignalSafeDisposal, TerminalNotInstalledError, uniqueWindowTitle } from "../src/terminal-session/session.ts";
import type { TerminalEmulator } from "../src/terminal-emulator/terminal-emulator.ts";
import type { SignalPort } from "../src/terminal-session/session.ts";

function fakeSignalPort() {
  const handlers: { exit: (() => void)[]; SIGINT: (() => void)[]; SIGTERM: (() => void)[] } = { exit: [], SIGINT: [], SIGTERM: [] };
  const port: SignalPort = {
    onExit: (handler) => {
      handlers.exit.push(handler);
    },
    onSignal: (signal, handler) => {
      handlers[signal as "SIGINT" | "SIGTERM"].push(handler);
    },
  };
  return { port, handlers };
}

test("dispose() called twice only kills once", () => {
  let kills = 0;
  const dispose = idempotentDisposer(() => {
    kills = kills + 1;
  });
  dispose();
  dispose();
  expect(kills).toBe(1);
});

test("an explicit dispose and a signal-triggered dispose still only kill once combined", () => {
  let kills = 0;
  const dispose = idempotentDisposer(() => {
    kills = kills + 1;
  });
  const { port, handlers } = fakeSignalPort();
  registerSignalSafeDisposal(dispose, port);

  dispose();
  for (const handler of handlers.SIGINT) {
    handler();
  }
  for (const handler of handlers.SIGTERM) {
    handler();
  }
  for (const handler of handlers.exit) {
    handler();
  }

  expect(kills).toBe(1);
});

test("registerSignalSafeDisposal wires dispose to exit, SIGINT and SIGTERM", () => {
  const { port, handlers } = fakeSignalPort();
  registerSignalSafeDisposal(() => {}, port);
  expect(handlers.exit.length).toBe(1);
  expect(handlers.SIGINT.length).toBe(1);
  expect(handlers.SIGTERM.length).toBe(1);
});

test("uniqueWindowTitle looks like termshot-<pid>-<ms>", () => {
  const a = uniqueWindowTitle();
  expect(a).toMatch(/^termshot-\d+-\d+$/);
  expect(a.startsWith(`termshot-${process.pid}-`)).toBe(true);
});

test("launching a terminal that is not installed fails with a named error before spawning anything", () => {
  let argvRequested = false;
  const missing: TerminalEmulator = {
    id: "missing",
    displayName: "Missing Term",
    executable: "/nonexistent/termshot-test/missing-term",
    launchArgv: () => {
      argvRequested = true;
      return [];
    },
  };
  const { port, handlers } = fakeSignalPort();
  expect(() => launchSession(missing, { title: "t", script: "true", cols: 1, rows: 1 }, port)).toThrow(TerminalNotInstalledError);
  expect(() => launchSession(missing, { title: "t", script: "true", cols: 1, rows: 1 }, port)).toThrow("Missing Term is not installed (expected /nonexistent/termshot-test/missing-term). Choose another terminal (ghostty, alacritty) with --terminal <name> or `termshot config set terminal <name>`");
  expect(argvRequested).toBe(false);
  expect(handlers.exit.length).toBe(0);
});
