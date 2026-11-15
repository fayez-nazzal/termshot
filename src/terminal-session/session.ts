import { existsSync } from "node:fs";
import { TERMINAL_IDS } from "../terminal-emulator/registry.ts";
import type { LaunchSpec, TerminalEmulator } from "../terminal-emulator/terminal-emulator.ts";
import { idempotentDisposer, registerSignalSafeDisposal, type SignalPort } from "../command-run/disposal.ts";

export { processSignalPort } from "../command-run/disposal.ts";

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
