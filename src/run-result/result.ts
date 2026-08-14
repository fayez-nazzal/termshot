export type RunStatus = "ok" | "command-failed" | "usage-error" | "environment-error" | "timeout" | "truncated" | "publish-failed" | "internal-error";

export interface CommandResult {
  argv: string[];
  exitStatus: number | null;
  durationMs: number | null;
  timedOut: boolean;
}

export interface CaptureResult {
  path: string | null;
  bytes: number | null;
  width: number | null;
  height: number | null;
  sha256: string | null;
}

export interface TerminalResult {
  cols: number | null;
  rows: number | null;
  renderedRows: number | null;
  truncated: boolean;
  overflowRows: number | null;
}

export interface PublishResult {
  requested: boolean;
  url: string | null;
  markdown: string | null;
  verified: boolean;
}

export interface RunError {
  step: string;
  message: string;
}

export interface RunResult {
  tool: string;
  version: string;
  status: RunStatus;
  exitCode: number;
  command: CommandResult;
  capture: CaptureResult;
  terminal: TerminalResult;
  publish: PublishResult;
  errors: RunError[];
}
