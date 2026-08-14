import { exitCodeFor } from "./exit-codes.ts";
import type { CaptureResult, CommandResult, PublishResult, RunError, RunResult, RunStatus, TerminalResult } from "./result.ts";

const EMPTY_COMMAND: CommandResult = { argv: [], exitStatus: null, durationMs: null, timedOut: false };
const EMPTY_CAPTURE: CaptureResult = { path: null, bytes: null, width: null, height: null, sha256: null };
const EMPTY_TERMINAL: TerminalResult = { cols: null, rows: null, renderedRows: null, truncated: false, overflowRows: null };
const EMPTY_PUBLISH: PublishResult = { requested: false, url: null, markdown: null, verified: false };

export interface RunResultFacts {
  tool: string;
  version: string;
  status: RunStatus;
  command?: Partial<CommandResult>;
  capture?: Partial<CaptureResult>;
  terminal?: Partial<TerminalResult>;
  publish?: Partial<PublishResult>;
  errors?: RunError[];
}

export function buildResult(facts: RunResultFacts): RunResult {
  const result: RunResult = {
    tool: facts.tool,
    version: facts.version,
    status: facts.status,
    exitCode: 0,
    command: { ...EMPTY_COMMAND, ...facts.command },
    capture: { ...EMPTY_CAPTURE, ...facts.capture },
    terminal: { ...EMPTY_TERMINAL, ...facts.terminal },
    publish: { ...EMPTY_PUBLISH, ...facts.publish },
    errors: facts.errors ?? [],
  };
  result.exitCode = exitCodeFor(result);
  return result;
}
