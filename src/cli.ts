#!/usr/bin/env bun

import { homedir } from "node:os";
import { join } from "node:path";
import { captureScreen, closeGhosttyProcess, launchGhostty, uniqueWindowTitle, waitForWindow } from "./capture.ts";
import { publish } from "./publish.ts";
import { writeArtifact } from "./screen-capture/artifact.ts";
import { parseFlags } from "./invocation/flags.ts";
import { helpText } from "./invocation/help.ts";
import { buildResult } from "./run-result/build.ts";
import { emit } from "./run-result/emit.ts";
import { exitCodeFor } from "./run-result/exit-codes.ts";
import { runTermshot } from "./run.ts";
import type { RunPorts } from "./run.ts";

export const VERSION = "0.5.0";
export { DEFAULT_RUN_COLS, DEFAULT_RUN_ROWS } from "./invocation/flags.ts";

function timestamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function defaultOutputPath(): string {
  return join(homedir(), "termshot", `${timestamp()}.png`);
}

function buildLivePorts(): RunPorts {
  return {
    session: {
      launch: launchGhostty,
      dispose: closeGhosttyProcess,
    },
    windows: {
      waitForWindow,
    },
    capture: {
      grab: (windowId: number) => captureScreen({ windowId }),
    },
    artifacts: {
      write: writeArtifact,
    },
    statusStore: {
      read: () => "",
    },
    clock: {
      now: () => Date.now(),
      sleep: (ms: number) => Bun.sleepSync(ms),
    },
    publisher: {
      publish: (filePath: string, dest: string, size: number, label: string) => publish({ filePath, dest, isGif: false, size, label }),
    },
  };
}

function main() {
  const flags = parseFlags(process.argv.slice(2));

  if (!flags.ok) {
    const result = buildResult({ tool: "termshot", version: VERSION, status: "usage-error", errors: [{ step: "flags", message: flags.message }] });
    emit(result);
    process.exit(exitCodeFor(result));
  } else if (flags.help) {
    process.stdout.write(helpText(VERSION));
  } else if (flags.version) {
    process.stdout.write(`${VERSION}\n`);
  } else {
    const outputPath = flags.invocation.output ?? defaultOutputPath();
    const title = uniqueWindowTitle();
    const result = runTermshot(VERSION, flags.invocation, outputPath, buildLivePorts(), title);
    emit(result);
    process.exit(exitCodeFor(result));
  }
}

if (import.meta.main) {
  main();
}
