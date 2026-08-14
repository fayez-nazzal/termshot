import { decideCompletion } from "./completion.ts";
import { parseExitStatus } from "./exit-status.ts";
import type { CommandOutcome } from "./exit-status.ts";
import type { RunPlan } from "./run-plan.ts";

export interface CommandRunResult {
  exitStatus: number | null;
  timedOut: boolean;
  durationMs: number;
}

export interface StatusStorePort {
  read(path: string): string;
}

export interface ClockPort {
  now(): number;
  sleep(ms: number): void;
}

const POLL_INTERVAL_MS = 250;

export function runCommand(plan: RunPlan, statusStore: StatusStorePort, clock: ClockPort, timeoutMs: number): CommandRunResult {
  const start = clock.now();
  let outcome: CommandOutcome = parseExitStatus(statusStore.read(plan.statusPath));
  let completion = decideCompletion(outcome, clock.now() - start, timeoutMs);
  while (completion === "wait") {
    clock.sleep(POLL_INTERVAL_MS);
    outcome = parseExitStatus(statusStore.read(plan.statusPath));
    completion = decideCompletion(outcome, clock.now() - start, timeoutMs);
  }

  let result: CommandRunResult;
  if (completion === "capture" && outcome.state === "exited") {
    result = { exitStatus: outcome.code, timedOut: false, durationMs: clock.now() - start };
  } else {
    result = { exitStatus: null, timedOut: true, durationMs: clock.now() - start };
  }
  return result;
}
