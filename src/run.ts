import type { ArtifactRecord } from "./artifact/artifact.ts";
import { pngHeader } from "./artifact/png-header.ts";
import type { CommandRunner, CommandRunResult } from "./command-run/command-runner.ts";
import { buildFrame } from "./frame/frame.ts";
import type { Frame } from "./frame/frame.ts";
import type { Highlighter } from "./highlighting/highlighter.ts";
import type { Invocation } from "./invocation/invocation.ts";
import type { Prompt, PromptContext, PromptOptions } from "./prompt/prompt.ts";
import type { PublishedImage, PublishRequest } from "./publishing/publisher.ts";
import type { PublisherId } from "./publishing/registry.ts";
import type { Renderer } from "./rendering/renderer.ts";
import { buildResult } from "./run-result/build.ts";
import type { RunResultFacts } from "./run-result/build.ts";
import type { CommandResult, RunError, RunResult, RunStatus } from "./run-result/result.ts";
import type { ShellId } from "./shell/registry.ts";
import type { TerminalEmulator } from "./terminal-emulation/terminal-emulator.ts";
import type { Theme } from "./theme/theme.ts";

export interface ArtifactsPort {
  write(path: string, data: Uint8Array): ArtifactRecord;
}

export interface PublisherPort {
  publish(request: PublishRequest): PublishedImage;
}

// Throws when the configured shell is not installed.
export interface ShellPort {
  argv(command: string): string[];
}

export interface RunPorts {
  shell: ShellPort;
  runner: CommandRunner;
  emulator: TerminalEmulator;
  prompt: Prompt;
  highlighter: Highlighter;
  renderer: Renderer;
  artifacts: ArtifactsPort;
  publisher: PublisherPort;
}

// Every value here is already resolved: flags over config over defaults.
export interface CaptureSettings {
  shell: ShellId;
  theme: Theme;
  fontSize: number;
  cols: number;
  rows: number;
  prompt: PromptOptions;
  publisher: PublisherId;
}

export interface RunSetup {
  version: string;
  invocation: Invocation;
  settings: CaptureSettings;
  promptContext: PromptContext;
  env: Record<string, string>;
  cwd: string;
  outputPath: string;
}

const TOOL = "termshot";
const COMMAND_TIMEOUT_MS = 60000;

type Failure = { ok: false; status: RunStatus; error: RunError };
type Attempt<T> = { ok: true; value: T } | Failure;

// Runs one step. A throw becomes a failure carrying the step's status, so the
// steps after it can pass it along instead of running.
async function attempt<T>(status: RunStatus, step: string, work: () => T | Promise<T>): Promise<Attempt<T>> {
  let result: Attempt<T>;
  try {
    result = { ok: true, value: await work() };
  } catch (e) {
    result = { ok: false, status, error: { step, message: (e as Error).message } };
  }
  return result;
}

// Every record names the command, the configured shell and, when --publish
// was passed, the publisher.
function record(setup: RunSetup, facts: Omit<RunResultFacts, "tool" | "version">): RunResult {
  const { invocation, settings } = setup;
  const requested = invocation.publishDest != null;
  return buildResult({
    ...facts,
    tool: TOOL,
    version: setup.version,
    command: { argv: [invocation.command], ...facts.command },
    terminal: { ...facts.terminal, shell: settings.shell },
    publish: { requested, publisher: requested ? settings.publisher : null, ...facts.publish },
  });
}

function commandFacts(invocation: Invocation, run: CommandRunResult): CommandResult {
  return { argv: [invocation.command], exitStatus: run.exitStatus, durationMs: run.durationMs, timedOut: run.timedOut };
}

// The grid of a rendered frame. Records where nothing was rendered leave it null.
function grid(frame: Frame): { cols: number; rows: number } {
  return { cols: frame.cols, rows: frame.rows.length };
}

interface Drawing {
  frame: Frame;
  png: Uint8Array;
}

async function draw(setup: RunSetup, ports: RunPorts, run: CommandRunResult): Promise<Attempt<Drawing>> {
  const { invocation, settings, promptContext } = setup;
  const output = await attempt("internal-error", "terminal-emulation", () => ports.emulator.render(run.output, settings.cols, settings.rows));
  const frame = !output.ok
    ? output
    : await attempt("internal-error", "rendering", () =>
        buildFrame({
          prompt: ports.prompt.segments(promptContext, settings.prompt),
          command: ports.highlighter.tokenize(invocation.command),
          output: output.value,
          cols: settings.cols,
          rows: settings.rows,
        }),
      );
  return !frame.ok
    ? frame
    : await attempt("internal-error", "rendering", async () => ({ frame: frame.value, png: await ports.renderer.render(frame.value, settings.theme, settings.fontSize) }));
}

// Reads the written PNG back and publishes it when asked.
function finish(setup: RunSetup, ports: RunPorts, command: CommandResult, drawing: Drawing, artifact: ArtifactRecord): RunResult {
  const { invocation } = setup;
  const errors: RunError[] = [];
  let width: number | null = null;
  let height: number | null = null;
  try {
    const header = pngHeader(drawing.png);
    width = header.width;
    height = header.height;
  } catch (e) {
    errors.push({ step: "artifact", message: (e as Error).message });
  }

  let status: RunStatus = "ok";
  if (command.exitStatus !== 0) {
    status = "command-failed";
  } else if (errors.length > 0) {
    status = "internal-error";
  }

  let publishUrl: string | null = null;
  let publishMarkdown: string | null = null;
  let publishVerified = false;
  if (invocation.publishDest != null) {
    const label = invocation.publishLabel ?? artifact.path;
    try {
      const published = ports.publisher.publish({ filePath: artifact.path, sha256: artifact.sha256, dest: invocation.publishDest, size: invocation.publishSize, label });
      publishUrl = published.url;
      publishMarkdown = published.markdown;
      publishVerified = true;
    } catch (e) {
      errors.push({ step: "publish", message: (e as Error).message });
      status = "publish-failed";
    }
  }

  return record(setup, {
    status,
    command,
    capture: { path: artifact.path, bytes: artifact.bytes, sha256: artifact.sha256, width, height },
    terminal: grid(drawing.frame),
    publish: { url: publishUrl, markdown: publishMarkdown, verified: publishVerified },
    errors,
  });
}

async function capture(setup: RunSetup, ports: RunPorts, run: CommandRunResult): Promise<RunResult> {
  const command = commandFacts(setup.invocation, run);
  const drawing = await draw(setup, ports, run);
  let result: RunResult;
  if (!drawing.ok) {
    result = record(setup, { status: drawing.status, command, errors: [drawing.error] });
  } else {
    const drawn = drawing.value;
    const artifact = await attempt("environment-error", "artifact", () => ports.artifacts.write(setup.outputPath, drawn.png));
    if (!artifact.ok) {
      result = record(setup, { status: artifact.status, command, terminal: grid(drawn.frame), errors: [artifact.error] });
    } else {
      result = finish(setup, ports, command, drawn, artifact.value);
    }
  }
  return result;
}

export async function runTermshot(setup: RunSetup, ports: RunPorts): Promise<RunResult> {
  const { invocation, settings } = setup;
  const argv = await attempt("environment-error", "shell", () => ports.shell.argv(invocation.command));
  const run = !argv.ok
    ? argv
    : await attempt("environment-error", "command-run", () =>
        ports.runner.run({ argv: argv.value, cols: settings.cols, rows: settings.rows, env: setup.env, cwd: setup.cwd, timeoutMs: COMMAND_TIMEOUT_MS }),
      );
  let result: RunResult;
  if (!run.ok) {
    result = record(setup, { status: run.status, errors: [run.error] });
  } else if (run.value.timedOut) {
    result = record(setup, {
      status: "timeout",
      command: commandFacts(invocation, run.value),
      errors: [{ step: "command-run", message: `command did not finish within ${COMMAND_TIMEOUT_MS}ms` }],
    });
  } else {
    result = await capture(setup, ports, run.value);
  }
  return result;
}
