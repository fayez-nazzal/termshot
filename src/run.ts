import type { ArtifactRecord } from "./screen-capture/artifact.ts";
import { pngHeader } from "./screen-capture/png-header.ts";
import { buildResult } from "./run-result/build.ts";
import { buildRunPlan } from "./command-run/run-plan.ts";
import { runCommand } from "./command-run/runner.ts";
import type { ClockPort, StatusStorePort } from "./command-run/runner.ts";
import type { Invocation } from "./invocation/invocation.ts";
import type { RunError, RunResult, RunStatus } from "./run-result/result.ts";

export interface SessionPort {
  launch(title: string, script: string, cols: number, rows: number): number;
  dispose(pid: number): void;
}

export interface WindowsPort {
  waitForWindow(pid: number, timeoutMs: number): number;
}

export interface CapturePort {
  grab(windowId: number): Uint8Array;
}

export interface ArtifactsPort {
  write(path: string, data: Uint8Array): ArtifactRecord;
}

export interface PublishedRecord {
  url: string;
  markdown: string;
}

export interface PublisherPort {
  publish(filePath: string, dest: string, size: number, label: string): PublishedRecord;
}

export interface RunPorts {
  session: SessionPort;
  windows: WindowsPort;
  capture: CapturePort;
  artifacts: ArtifactsPort;
  statusStore: StatusStorePort;
  clock: ClockPort;
  publisher: PublisherPort;
}

const TOOL = "termshot";
const WINDOW_TIMEOUT_MS = 15000;
const COMMAND_TIMEOUT_MS = 60000;

function failure(version: string, status: RunStatus, step: string, message: string): RunResult {
  const errors: RunError[] = [{ step, message }];
  return buildResult({ tool: TOOL, version, status, errors });
}

export function runTermshot(version: string, invocation: Invocation, outputPath: string, statusPath: string, ports: RunPorts, title: string): RunResult {
  let result: RunResult;
  const plan = buildRunPlan(invocation, statusPath);

  let pid: number;
  try {
    pid = ports.session.launch(title, plan.innerScriptText, invocation.cols, invocation.rows);
  } catch (e) {
    result = failure(version, "environment-error", "terminal-session", (e as Error).message);
    return result;
  }

  let windowId: number;
  try {
    windowId = ports.windows.waitForWindow(pid, WINDOW_TIMEOUT_MS);
  } catch (e) {
    ports.session.dispose(pid);
    result = failure(version, "environment-error", "terminal-session", (e as Error).message);
    return result;
  }

  ports.clock.sleep(invocation.settleMs);

  const commandRun = runCommand(plan, ports.statusStore, ports.clock, COMMAND_TIMEOUT_MS);
  if (commandRun.timedOut) {
    ports.session.dispose(pid);
    result = buildResult({
      tool: TOOL,
      version,
      status: "timeout",
      command: { argv: [invocation.command], exitStatus: null, durationMs: commandRun.durationMs, timedOut: true },
      errors: [{ step: "command-run", message: `command did not finish within ${COMMAND_TIMEOUT_MS}ms` }],
    });
    return result;
  }

  let png: Uint8Array;
  try {
    png = ports.capture.grab(windowId);
  } catch (e) {
    ports.session.dispose(pid);
    result = failure(version, "environment-error", "screen-capture", (e as Error).message);
    return result;
  }
  ports.session.dispose(pid);

  const artifact = ports.artifacts.write(outputPath, png);

  const errors: RunError[] = [];
  let width: number | null = null;
  let height: number | null = null;
  try {
    const header = pngHeader(png);
    width = header.width;
    height = header.height;
  } catch (e) {
    errors.push({ step: "screen-capture", message: (e as Error).message });
  }

  let status: RunStatus = "ok";
  if (commandRun.exitStatus !== 0) {
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
      const published = ports.publisher.publish(artifact.path, invocation.publishDest, invocation.publishSize, label);
      publishUrl = published.url;
      publishMarkdown = published.markdown;
      publishVerified = true;
    } catch (e) {
      errors.push({ step: "publish", message: (e as Error).message });
      status = "publish-failed";
    }
  }

  result = buildResult({
    tool: TOOL,
    version,
    status,
    command: { argv: [invocation.command], exitStatus: commandRun.exitStatus, durationMs: commandRun.durationMs, timedOut: false },
    capture: { path: artifact.path, bytes: artifact.bytes, sha256: artifact.sha256, width, height },
    terminal: { cols: invocation.cols, rows: invocation.rows },
    publish: { requested: invocation.publishDest != null, url: publishUrl, markdown: publishMarkdown, verified: publishVerified },
    errors,
  });
  return result;
}
