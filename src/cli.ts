#!/usr/bin/env bun

import { readFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { captureScreen, closeGhosttyProcess, uniqueWindowTitle, waitForWindow } from "./capture.ts";
import { processSignalPort, launchSession } from "./terminal-session/session.ts";
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

function readStatusFile(path: string): string {
  let result = "";
  try {
    result = readFileSync(path, "utf8");
  } catch {
    result = "";
  }
  return result;
}

function buildLivePorts(): RunPorts {
  const sessionDisposers = new Map<number, () => void>();
  const signals = processSignalPort();
  return {
    session: {
      launch: (title: string, script: string, cols: number, rows: number) => {
        const session = launchSession(title, script, cols, rows, signals);
        sessionDisposers.set(session.pid, session.dispose);
        return session.pid;
      },
      dispose: (pid: number) => {
        const dispose = sessionDisposers.get(pid);
        if (dispose != null) {
          dispose();
        } else {
          closeGhosttyProcess(pid);
        }
      },
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
      read: readStatusFile,
    },
    clock: {
      now: () => Date.now(),
      sleep: (ms: number) => Bun.sleepSync(ms),
    },
    publisher: {
      publish: (filePath: string, dest: string, size: number, label: string) => publish({ filePath, dest, size, label }),
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
    const statusPath = join(tmpdir(), `${title}.status`);
    const result = runTermshot(VERSION, flags.invocation, outputPath, statusPath, buildLivePorts(), title);
    emit(result);
    process.exit(exitCodeFor(result));
  }
}

if (import.meta.main) {
  main();
}
