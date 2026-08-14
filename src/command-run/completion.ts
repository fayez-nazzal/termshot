import type { CommandOutcome } from "./exit-status.ts";

export type Completion = "wait" | "capture" | "timeout";

export function decideCompletion(outcome: CommandOutcome, elapsedMs: number, timeoutMs: number): Completion {
  let result: Completion;
  if (outcome.state === "exited") {
    result = "capture";
  } else if (elapsedMs >= timeoutMs) {
    result = "timeout";
  } else {
    result = "wait";
  }
  return result;
}
