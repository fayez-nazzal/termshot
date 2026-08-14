import { innerScript } from "./inner-script.ts";
import type { Invocation } from "../invocation/invocation.ts";

export interface RunPlan {
  innerScriptText: string;
  statusPath: string;
}

export function buildRunPlan(invocation: Invocation, statusPath: string): RunPlan {
  return {
    innerScriptText: innerScript(invocation.command, statusPath),
    statusPath,
  };
}
