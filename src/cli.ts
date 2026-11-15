#!/usr/bin/env bun

import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { effectiveConfig, setConfigValue, unsetConfigValue } from "./configuration/config.ts";
import type { Config, StoredConfig } from "./configuration/config.ts";
import { readStoredConfig, writeStoredConfig } from "./configuration/config-store.ts";
import { configPathFor, defaultCapturePath, ensureTermshotDir, findProjectRoot, liveProjectProbe } from "./configuration/project.ts";
import { writeArtifact } from "./artifact/artifact.ts";
import { defaultCommandRunner } from "./command-run/registry.ts";
import { commandEnv } from "./command-run/environment.ts";
import { defaultHighlighter } from "./highlighting/registry.ts";
import { parseConfigCommand } from "./invocation/config-command.ts";
import type { ConfigCommand } from "./invocation/config-command.ts";
import { parseFlags } from "./invocation/flags.ts";
import { helpText } from "./invocation/help.ts";
import type { Invocation } from "./invocation/invocation.ts";
import { readGitBranch, liveGitRunner } from "./prompt/context.ts";
import type { PromptContext } from "./prompt/prompt.ts";
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

function timestamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function livePorts(shell: ShellId, publisher: Publisher): RunPorts {
  return {
    shell: { argv: (command) => resolveShellArgv(shell, command, Bun.which) },
    runner: defaultCommandRunner(),
    emulator: defaultEmulator(),
    prompt: defaultPrompt(),
    highlighter: defaultHighlighter(),
    renderer: defaultRenderer(),
    artifacts: { write: writeArtifact },
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

function promptContext(cwd: string, settings: CaptureSettings): PromptContext {
  return { cwd, home: homedir(), gitBranch: settings.prompt.git ? readGitBranch(cwd, liveGitRunner) : null };
}

// -o wins. Otherwise captures go in the project's .termshot/captures/, or in
// ~/termshot/ outside any project, where nothing is created in cwd.
function outputPathFor(invocation: Invocation, root: string | null): string {
  let result = invocation.output;
  if (result == null && root != null) {
    try {
      ensureTermshotDir(root);
    } catch (e) {
      fail("environment-error", "artifact", (e as Error).message);
    }
  }
  result ??= defaultCapturePath(root, homedir(), timestamp());
  return result;
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
    const result = await runTermshot(
      {
        version: VERSION,
        invocation,
        settings,
        promptContext: promptContext(cwd, settings),
        env: commandEnv(process.env, EMULATOR_TERM_NAME, settings.cols, settings.rows),
        cwd,
        outputPath: outputPathFor(invocation, root),
      },
      livePorts(settings.shell, publisher),
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
