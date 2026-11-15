import type { CommandRunner } from "./command-runner.ts";
import { processSignalPort } from "./disposal.ts";
import { ptyCommandRunner } from "./pty.ts";

export function defaultCommandRunner(): CommandRunner {
  return ptyCommandRunner(processSignalPort());
}
