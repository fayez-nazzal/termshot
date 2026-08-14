import type { RunResult, RunStatus } from "./result.ts";

const EXIT_CODE_BY_STATUS: Record<RunStatus, number> = {
  ok: 0,
  "command-failed": 1,
  "usage-error": 2,
  "environment-error": 3,
  timeout: 4,
  truncated: 5,
  "publish-failed": 6,
  "internal-error": 7,
};

export function exitCodeFor(result: RunResult): number {
  const code = EXIT_CODE_BY_STATUS[result.status];
  if (code == null) {
    throw new Error(`no exit code documented for status "${result.status}"`);
  }
  return code;
}
