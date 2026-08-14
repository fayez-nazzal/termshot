import type { RunResult } from "./result.ts";

export function emit(result: RunResult): void {
  process.stdout.write(`${JSON.stringify(result)}\n`);
  for (const error of result.errors) {
    process.stderr.write(`termshot: ${error.step}: ${error.message}\n`);
  }
  if (result.capture.path != null) {
    process.stderr.write(`termshot: wrote ${result.capture.path} (${result.capture.bytes} bytes)\n`);
  }
}
