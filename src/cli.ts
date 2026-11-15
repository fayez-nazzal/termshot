#!/usr/bin/env bun

import { existsSync, readFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { effectiveConfig, setConfigValue, unsetConfigValue } from "./configuration/config.ts";
import type { Config, StoredConfig } from "./configuration/config.ts";
import { readStoredConfig, writeStoredConfig } from "./configuration/config-store.ts";
import { configPathFor, ensureTermshotDir, findProjectRoot, liveProjectProbe } from "./configuration/project.ts";
import { processSignalPort, launchSession, terminateProcess, uniqueWindowTitle } from "./terminal-session/session.ts";
import { waitForWindow } from "./terminal-session/window-lookup.ts";
import { captureWindow } from "./screen-capture/screen-capture.ts";
import { writeArtifact } from "./screen-capture/artifact.ts";
import { parseConfigCommand } from "./invocation/config-command.ts";
import type { ConfigCommand } from "./invocation/config-command.ts";
import { parseFlags } from "./invocation/flags.ts";
import { helpText } from "./invocation/help.ts";
import { buildResult } from "./run-result/build.ts";
import { emit } from "./run-result/emit.ts";
import { exitCodeFor } from "./run-result/exit-codes.ts";
import type { RunStatus } from "./run-result/result.ts";
import { publisherFor } from "./publishing/registry.ts";
import type { Publisher } from "./publishing/publisher.ts";
import { DEFAULT_TERMINAL_ID, terminalEmulator } from "./terminal-emulator/registry.ts";
import type { TerminalEmulator } from "./terminal-emulator/terminal-emulator.ts";
import { runTermshot } from "./run.ts";
import type { RunPorts } from "./run.ts";
import packageJson from "../package.json";

export const VERSION = packageJson.version;

const TOOL = "termshot";

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

function buildLivePorts(emulator: TerminalEmulator, publisher: Publisher): RunPorts {
  const sessionDisposers = new Map<number, () => void>();
  const signals = processSignalPort();
  return {
    session: {
      launch: (spec) => {
        const session = launchSession(emulator, spec, signals);
        sessionDisposers.set(session.pid, session.dispose);
        return session.pid;
      },
      dispose: (pid: number) => {
        const dispose = sessionDisposers.get(pid);
        if (dispose != null) {
          dispose();
        } else {
          terminateProcess(pid);
        }
      },
    },
    windows: {
      waitForWindow,
    },
    capture: {
      grab: captureWindow,
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
      publish: (request) => publisher.publish(request),
    },
  };
}

function fail(status: RunStatus, step: string, message: string): never {
  const result = buildResult({ tool: TOOL, version: VERSION, status, errors: [{ step, message }] });
  emit(result);
  process.exit(exitCodeFor(result));
}

function loadStoredConfig(path: string): StoredConfig {
  let stored: StoredConfig = {};
  try {
    stored = readStoredConfig(path);
  } catch (e) {
    fail("usage-error", "config", (e as Error).message);
  }
  return stored;
}

function applyConfigCommand(stored: StoredConfig, command: ConfigCommand): StoredConfig {
  let next = stored;
  if (command.action === "set") {
    next = setConfigValue(stored, command.key, command.value);
  } else if (command.action === "unset") {
    next = unsetConfigValue(stored, command.key);
  }
  return next;
}

function runConfig(args: string[]): void {
  const parsed = parseConfigCommand(args);
  if (!parsed.ok) {
    fail("usage-error", "config", parsed.message);
  }
  const root = findProjectRoot(process.cwd(), liveProjectProbe) ?? process.cwd();
  const path = configPathFor(root);
  const stored = loadStoredConfig(path);
  let next: StoredConfig = stored;
  try {
    next = applyConfigCommand(stored, parsed.command);
  } catch (e) {
    fail("usage-error", "config", (e as Error).message);
  }
  // Only set creates .termshot/; unset rewrites a config file that already exists.
  const creates = parsed.command.action === "set";
  if (creates || (parsed.command.action === "unset" && existsSync(path))) {
    try {
      if (creates) {
        ensureTermshotDir(root);
      }
      writeStoredConfig(path, next);
    } catch (e) {
      fail("environment-error", "config", (e as Error).message);
    }
  }
  const config: Config = effectiveConfig(next);
  process.stdout.write(`${JSON.stringify({ tool: TOOL, version: VERSION, configPath: path, config })}\n`);
}

function runCapture(argv: string[]): void {
  const flags = parseFlags(argv);
  if (!flags.ok) {
    fail("usage-error", "flags", flags.message);
  } else if (flags.help) {
    process.stdout.write(helpText(VERSION));
  } else if (flags.version) {
    process.stdout.write(`${VERSION}\n`);
  } else {
    const root = findProjectRoot(process.cwd(), liveProjectProbe);
    const config = effectiveConfig(root != null ? loadStoredConfig(configPathFor(root)) : {});
    // Temporary until the headless runner replaces this path: the terminal
    // config key and flag are gone, so the old path uses the default emulator.
    const terminal = DEFAULT_TERMINAL_ID;
    // Temporary until the headless runner replaces this path
    const invocation = { ...flags.invocation, cols: flags.invocation.cols ?? config.cols, rows: flags.invocation.rows ?? config.rows };
    const publisherId = flags.invocation.publisher ?? config.publisher;
    const publisher = publisherFor(publisherId);
    if (flags.invocation.publishDest != null) {
      const problem = publisher.destinationProblem(flags.invocation.publishDest);
      if (problem != null) {
        fail("usage-error", "flags", problem);
      }
    }
    const outputPath = flags.invocation.output ?? defaultOutputPath();
    const title = uniqueWindowTitle();
    const statusPath = join(tmpdir(), `${title}.status`);
    const result = runTermshot({ version: VERSION, invocation, terminal, publisher: publisherId, outputPath, statusPath, title }, buildLivePorts(terminalEmulator(terminal), publisher));
    emit(result);
    process.exit(exitCodeFor(result));
  }
}

function main() {
  const argv = process.argv.slice(2);
  if (argv[0] === "config") {
    runConfig(argv.slice(1));
  } else {
    runCapture(argv);
  }
}

if (import.meta.main) {
  main();
}
