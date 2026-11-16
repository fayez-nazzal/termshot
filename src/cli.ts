#!/usr/bin/env bun

import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { effectiveConfig, setConfigValue, unsetConfigValue } from "./configuration/config.ts";
import type { Config, StoredConfig } from "./configuration/config.ts";
import { readStoredConfig, writeStoredConfig } from "./configuration/config-store.ts";
import { configPathFor, defaultCapturePath, ensureTermshotDir, findProjectRoot, liveProjectProbe } from "./configuration/project.ts";
import { writeArtifact, writeNewArtifact } from "./artifact/artifact.ts";
import type { ArtifactRecord } from "./artifact/artifact.ts";
import { defaultCommandRunner } from "./command-run/registry.ts";
import { commandEnv } from "./command-run/environment.ts";
import { defaultHighlighter } from "./highlighting/registry.ts";
import { parseConfigCommand } from "./invocation/config-command.ts";
import type { ConfigCommand } from "./invocation/config-command.ts";
import { parseFlags } from "./invocation/flags.ts";
import { helpText } from "./invocation/help.ts";
import type { Invocation } from "./invocation/invocation.ts";
import { readGitBranch, liveGitRunner } from "./prompt/context.ts";
import type { GitRunner } from "./prompt/context.ts";
import type { PromptContext, PromptOptions } from "./prompt/prompt.ts";
import { defaultPrompt } from "./prompt/registry.ts";
import { publisherFor } from "./publishing/registry.ts";
import type { Publisher } from "./publishing/publisher.ts";
import { defaultRenderer } from "./rendering/registry.ts";
import { buildResult } from "./run-result/build.ts";
import { emit } from "./run-result/emit.ts";
import { exitCodeFor } from "./run-result/exit-codes.ts";
import type { RunStatus } from "./run-result/result.ts";
import { resolveShellArgv } from "./shell/registry.ts";
import type { ShellId } from "./shell/registry.ts";
import { defaultEmulator, EMULATOR_TERM_NAME } from "./terminal-emulation/registry.ts";
import { themeFor } from "./theme/registry.ts";
import { runTermshot } from "./run.ts";
import type { CaptureSettings, RunPorts } from "./run.ts";
import packageJson from "../package.json";

export const VERSION = packageJson.version;

const TOOL = "termshot";

// Local time as YYYYMMDD-HHMMSS-mmm.
export function captureStamp(d: Date): string {
  const p = (n: number, width = 2) => String(n).padStart(width, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}-${p(d.getMilliseconds(), 3)}`;
}

// Where a capture goes. exclusive is set for the default path, so two runs
// in the same millisecond never overwrite each other; an explicit -o path is
// replaced. projectRoot is set when the capture goes to the project's default
// folder: .termshot/ is made only then, and only once there is an image.
export interface CaptureTarget {
  exclusive: boolean;
  projectRoot: string | null;
}

export function writeCapture(path: string, data: Uint8Array, target: CaptureTarget): ArtifactRecord {
  if (target.projectRoot != null) {
    ensureTermshotDir(target.projectRoot);
  }
  return target.exclusive ? writeNewArtifact(path, data) : writeArtifact(path, data);
}

function livePorts(shell: ShellId, publisher: Publisher, target: CaptureTarget): RunPorts {
  return {
    shell: { argv: (command) => resolveShellArgv(shell, command, Bun.which) },
    runner: defaultCommandRunner(),
    emulator: defaultEmulator(),
    prompt: defaultPrompt(),
    highlighter: defaultHighlighter(),
    renderer: defaultRenderer(),
    artifacts: { write: (path, data) => writeCapture(path, data, target) },
    publisher: { publish: (request) => publisher.publish(request) },
  };
}

// Flags beat the config file; the config already holds the defaults.
export function captureSettings(config: Config, invocation: Invocation): CaptureSettings {
  return {
    shell: config.shell,
    theme: themeFor(config.theme),
    fontSize: config["font.size"],
    cols: invocation.cols ?? config.cols,
    rows: invocation.rows ?? config.rows,
    prompt: {
      show: config["prompt.show"],
      directory: config["prompt.directory"],
      git: config["prompt.git"],
      symbol: config["prompt.symbol"],
    },
    publisher: invocation.publisher ?? config.publisher,
  };
}

// git runs only when the prompt is drawn with the branch in it.
export function promptContext(cwd: string, home: string, options: PromptOptions, git: GitRunner): PromptContext {
  return { cwd, home, gitBranch: options.show && options.git ? readGitBranch(cwd, git) : null };
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

async function runCapture(argv: string[]): Promise<void> {
  const flags = parseFlags(argv);
  if (!flags.ok) {
    fail("usage-error", "flags", flags.message);
  } else if (flags.help) {
    process.stdout.write(helpText(VERSION));
  } else if (flags.version) {
    process.stdout.write(`${VERSION}\n`);
  } else {
    const { invocation } = flags;
    const cwd = process.cwd();
    const root = findProjectRoot(cwd, liveProjectProbe);
    const config = effectiveConfig(root != null ? loadStoredConfig(configPathFor(root)) : {});
    const settings = captureSettings(config, invocation);
    const publisher = publisherFor(settings.publisher);
    if (invocation.publishDest != null) {
      const problem = publisher.destinationProblem(invocation.publishDest);
      if (problem != null) {
        fail("usage-error", "flags", problem);
      }
    }
    // -o wins. Otherwise captures go in the project's .termshot/captures/, or
    // in ~/termshot/ outside any project, where nothing is created in cwd.
    const byDefault = invocation.output == null;
    const outputPath = invocation.output ?? defaultCapturePath(root, homedir(), captureStamp(new Date()));
    const result = await runTermshot(
      {
        version: VERSION,
        invocation,
        settings,
        promptContext: promptContext(cwd, homedir(), settings.prompt, liveGitRunner),
        env: commandEnv(process.env, EMULATOR_TERM_NAME, settings.cols, settings.rows),
        cwd,
        outputPath,
      },
      livePorts(settings.shell, publisher, { exclusive: byDefault, projectRoot: byDefault ? root : null }),
    );
    emit(result);
    process.exit(exitCodeFor(result));
  }
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv[0] === "config") {
    runConfig(argv.slice(1));
  } else {
    await runCapture(argv);
  }
}

if (import.meta.main) {
  await main();
}
