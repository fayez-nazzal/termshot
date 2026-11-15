import { expect, test } from "bun:test";
import { idempotentDisposer, processSignalPort, registerSignalSafeDisposal, type SignalPort } from "../src/command-run/disposal.ts";

function fakeSignalPort() {
  const handlers: { exit: (() => void)[]; SIGINT: (() => void)[]; SIGTERM: (() => void)[] } = { exit: [], SIGINT: [], SIGTERM: [] };
  const remover = (list: (() => void)[], handler: () => void) => () => {
    list.splice(list.indexOf(handler), 1);
  };
  const port: SignalPort = {
    onExit: (handler) => {
      handlers.exit.push(handler);
      return remover(handlers.exit, handler);
    },
    onSignal: (signal, handler) => {
      const list = handlers[signal as "SIGINT" | "SIGTERM"];
      list.push(handler);
      return remover(list, handler);
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

test("the function registerSignalSafeDisposal returns removes all three listeners", () => {
  const { port, handlers } = fakeSignalPort();
  const unregister = registerSignalSafeDisposal(() => {}, port);
  unregister();
  expect(handlers).toEqual({ exit: [], SIGINT: [], SIGTERM: [] });
});

test("processSignalPort removes the process listener it added", () => {
  const before = process.listenerCount("SIGTERM");
  const remove = processSignalPort().onSignal("SIGTERM", () => {});
  expect(process.listenerCount("SIGTERM")).toBe(before + 1);
  remove();
  expect(process.listenerCount("SIGTERM")).toBe(before);
});
