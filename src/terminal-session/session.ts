import { existsSync } from "node:fs";
import { TERMINAL_IDS } from "../terminal-emulator/registry.ts";
import type { LaunchSpec, TerminalEmulator } from "../terminal-emulator/terminal-emulator.ts";

export interface SignalPort {
  onExit(handler: () => void): void;
  onSignal(signal: NodeJS.Signals, handler: () => void): void;
}

export function processSignalPort(): SignalPort {
  return {
    onExit: (handler: () => void) => {
      process.on("exit", handler);
    },
    onSignal: (signal: NodeJS.Signals, handler: () => void) => {
      process.on(signal, handler);
    },
  };
}

// Wraps kill so that no matter how many times dispose is called, or which
// caller calls it first (an explicit dispose in the pipeline, or a signal
// firing), the underlying kill only ever runs once.
export function idempotentDisposer(kill: () => void): () => void {
  let disposed = false;
  return () => {
    if (!disposed) {
      disposed = true;
      kill();
    }
  };
}

export function registerSignalSafeDisposal(dispose: () => void, signals: SignalPort): void {
  signals.onExit(dispose);
  signals.onSignal("SIGINT", dispose);
  signals.onSignal("SIGTERM", dispose);
}

export function uniqueWindowTitle(): string {
  return `termshot-${process.pid}-${Date.now()}`;
}

export class TerminalNotInstalledError extends Error {
  constructor(emulator: TerminalEmulator) {
    super(`${emulator.displayName} is not installed (expected ${emulator.executable}). Choose another terminal (${TERMINAL_IDS.join(", ")}) with --terminal <name> or \`termshot config set terminal <name>\``);
    this.name = "TerminalNotInstalledError";
  }
}

export function terminateProcess(pid: number): void {
  try {
    process.kill(pid, "SIGTERM");
  } catch {
    /* already gone */
  }
}

export interface Session {
  pid: number;
  dispose(): void;
}

export function launchSession(emulator: TerminalEmulator, spec: LaunchSpec, signals: SignalPort): Session {
  if (!existsSync(emulator.executable)) {
    throw new TerminalNotInstalledError(emulator);
  }
  const proc = Bun.spawn(emulator.launchArgv(spec), { stdout: "ignore", stderr: "ignore" });
  const pid = proc.pid;
  const dispose = idempotentDisposer(() => terminateProcess(pid));
  registerSignalSafeDisposal(dispose, signals);
  return { pid, dispose };
}
