import { expect, test } from "bun:test";
import { idempotentDisposer, registerSignalSafeDisposal, type SignalPort } from "../src/command-run/disposal.ts";

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
