export interface RunRequest {
  argv: string[];
  cols: number;
  rows: number;
  env: Record<string, string>;
  cwd: string;
  timeoutMs: number;
}

export interface CommandRunResult {
  output: Uint8Array;
  exitStatus: number | null;
  timedOut: boolean;
  durationMs: number;
}

// Runs argv in a pseudo-terminal of cols x rows and returns everything it
// wrote. A spawn failure is thrown as an Error.
export interface CommandRunner {
  run(request: RunRequest): Promise<CommandRunResult>;
}
