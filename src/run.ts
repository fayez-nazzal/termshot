import type { ArtifactRecord } from "./screen-capture/artifact.ts";
import { pngHeader } from "./screen-capture/png-header.ts";
import { buildResult } from "./run-result/build.ts";
import type { Invocation } from "./invocation/invocation.ts";
import type { RunError, RunResult, RunStatus } from "./run-result/result.ts";

export interface SessionPort {
  launch(title: string, command: string, cols: number, rows: number): number;
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

export interface StatusStorePort {
  read(path: string): string;
}

export interface ClockPort {
  now(): number;
  sleep(ms: number): void;
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

function failure(version: string, status: RunStatus, step: string, message: string, capture?: ArtifactRecord): RunResult {
  const errors: RunError[] = [{ step, message }];
  const captureFacts = capture != null ? { path: capture.path, bytes: capture.bytes, sha256: capture.sha256 } : {};
  return buildResult({ tool: TOOL, version, status, errors, capture: captureFacts });
}

export function runTermshot(version: string, invocation: Invocation, outputPath: string, ports: RunPorts, title: string): RunResult {
  let result: RunResult;

  let pid: number;
  try {
    pid = ports.session.launch(title, invocation.command, invocation.cols, invocation.rows);
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

  let status: RunStatus = errors.length > 0 ? "internal-error" : "ok";
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
    capture: { path: artifact.path, bytes: artifact.bytes, sha256: artifact.sha256, width, height },
    publish: { requested: invocation.publishDest != null, url: publishUrl, markdown: publishMarkdown, verified: publishVerified },
    errors,
  });
  return result;
}
