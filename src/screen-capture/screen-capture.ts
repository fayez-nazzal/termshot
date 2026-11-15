import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFileSync, unlinkSync } from "node:fs";

function captureMacWindow(windowId: number): Uint8Array {
  const tmp = join(tmpdir(), `termshot-${process.pid}-${Date.now()}.png`);
  const proc = Bun.spawnSync(["screencapture", "-x", "-l", String(windowId), "-o", tmp]);
  if (!proc.success) {
    const err = new TextDecoder().decode(proc.stderr).trim();
    throw new Error(`screencapture failed: ${err || `exit ${proc.exitCode}`}`);
  }
  let png: Uint8Array;
  try {
    png = new Uint8Array(readFileSync(tmp));
  } finally {
    try {
      unlinkSync(tmp);
    } catch {
      /* ignore */
    }
  }
  return png;
}

export function captureWindow(windowId: number): Uint8Array {
  if (process.platform !== "darwin") {
    throw new Error(`OS screenshot not supported on ${process.platform} (macOS only)`);
  }
  return captureMacWindow(windowId);
}
