import type { PublisherId } from "../publishing/registry.ts";
import type { TerminalId } from "../terminal-emulator/registry.ts";

export interface Invocation {
  command: string;
  output: string | null;
  settleMs: number;
  cols: number;
  rows: number;
  publishDest: string | null;
  publishSize: number;
  publishLabel: string | null;
  publisher: PublisherId | null;
  terminal: TerminalId | null;
}
