import { alacritty } from "./alacritty.ts";
import { ghostty } from "./ghostty.ts";
import type { TerminalEmulator } from "./terminal-emulator.ts";

const TERMINAL_EMULATORS = {
  ghostty,
  alacritty,
} as const satisfies Record<string, TerminalEmulator>;

export type TerminalId = keyof typeof TERMINAL_EMULATORS;

export const TERMINAL_IDS = Object.keys(TERMINAL_EMULATORS) as TerminalId[];

export const DEFAULT_TERMINAL_ID: TerminalId = "ghostty";

export function isTerminalId(value: unknown): value is TerminalId {
  return typeof value === "string" && Object.hasOwn(TERMINAL_EMULATORS, value);
}

export function parseTerminalId(value: unknown): TerminalId {
  if (!isTerminalId(value)) {
    throw new Error(`unknown terminal ${JSON.stringify(value)}; supported terminals: ${TERMINAL_IDS.join(", ")}`);
  }
  return value;
}

export function terminalEmulator(id: TerminalId): TerminalEmulator {
  return TERMINAL_EMULATORS[id];
}
