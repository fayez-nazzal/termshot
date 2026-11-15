import { xtermEmulator } from "./xterm.ts";
import type { TerminalEmulator } from "./terminal-emulator.ts";

export const EMULATOR_TERM_NAME = "xterm-256color";

export function defaultEmulator(): TerminalEmulator {
  return xtermEmulator;
}
