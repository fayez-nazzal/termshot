// Capture the screen via the OS. macOS: screencapture.

import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFileSync, unlinkSync } from "node:fs";
import { findWindowIdByPid } from "./terminal-session/window-lookup.ts";

export interface CaptureOptions {
  windowId: number; // macOS: capture a specific window by CGWindowID (-l), non-interactive
}

// Capture a PNG via the OS screenshot tool. Returns PNG bytes.
export function captureScreen(opts: CaptureOptions): Uint8Array {
  if (process.platform === "darwin") return captureMac(opts);
  throw new Error(`OS screenshot not supported on ${process.platform} (macOS only)`);
}

export function uniqueWindowTitle(): string {
  return `termshot-${process.pid}-${Date.now()}`;
}

export const GHOSTTY_BIN = "/Applications/Ghostty.app/Contents/MacOS/ghostty";

// Launching through `open -na Ghostty.app --args ...` routes the command
// through macOS Apple Events, and in practice that layer silently drops
// -e and --command: the window opens but falls back to the default login
// shell instead of running what we asked for. Invoking the bundled binary
// directly does not go through that layer and reliably runs the command.
//
// Everything in the captured window that is not the command's own output is
// noise in a published screenshot, so the wrapper removes all three sources:
//
//   - `Last login: ...` comes from /usr/bin/login. Clearing the screen, the
//     scrollback, and homing the cursor removes it, but the clear has to wait
//     a beat first: login can still be writing that line when `sh` starts, so
//     an immediate clear runs too early and the banner lands underneath the
//     command's output instead. That is what leaves a fragment of it stranded
//     on whichever row the output does not cover.
//   - `Process exited. Press any key to close the terminal.` is Ghostty's
//     wait-after-command banner. Holding the window open with a trailing sleep
//     instead means the command never "exits" while we are capturing, so the
//     banner never renders and a stray keypress can never echo into the frame.
//     termshot kills the process itself once the capture is written.
//   - Whatever sits below the output is wiped once the command has finished.
//     The opening clear cannot cover this: the login banner can still be
//     drawn after it, and the command's own output then overwrites only the
//     rows it fills, leaving a fragment of that banner on the row underneath.
//     Erasing from the cursor down at the end removes it without touching the
//     output above. The same escape hides the block cursor, which otherwise
//     lands in the frame on whichever captures catch its blink on.
//   - The same trailing sleep also covers the old race where a near-instant
//     command beat Ghostty's startup and produced a bogus "Ghostty failed to
//     launch the requested command" error screen.
//
// --window-width/--window-height are terminal grid cells, not pixels, and on
// macOS they lose to state restoration: Ghostty reopens at the last saved
// window frame and silently ignores the requested grid size. Disabling
// window-save-state for the spawned process is what makes the size stick.
//
// window-decoration=none drops the macOS titlebar. The title is only ever the
// internal `termshot-<pid>-<ts>` handle used to find the window again, so a
// titlebar puts a meaningless string in the middle of every published capture.
// Never re-enable decorations here.
export const SETTLE_BEFORE_CLEAR_SECONDS = 0.25;
export const CLEAR_SCREEN = "printf '\\033[2J\\033[3J\\033[H'";
export const TIDY_TAIL = "printf '\\033[J\\033[?25l'";
// Derived from the same budget termshot itself gives up on: run.ts waits up
// to WINDOW_TIMEOUT_MS for the window to appear and up to COMMAND_TIMEOUT_MS
// for the command to finish. Signal-safe disposal (terminal-session/session.ts)
// closes the window promptly in the normal case; this hold is only the
// worst-case backstop for a hard crash no signal handler can catch, so it
// should track that budget rather than sit open for a flat five minutes.
const WINDOW_WAIT_BUDGET_SECONDS = 15; // mirrors run.ts's WINDOW_TIMEOUT_MS
const COMMAND_RUN_BUDGET_SECONDS = 60; // mirrors run.ts's COMMAND_TIMEOUT_MS
export const HOLD_WINDOW_OPEN_SECONDS = WINDOW_WAIT_BUDGET_SECONDS + COMMAND_RUN_BUDGET_SECONDS;

export function wrappedCommand(command: string): string {
  return `sleep ${SETTLE_BEFORE_CLEAR_SECONDS}; ${CLEAR_SCREEN}; ${command}; ${TIDY_TAIL}; sleep ${HOLD_WINDOW_OPEN_SECONDS}`;
}

// Ghostty flag set for a fully-built inner script (see
// command-run/inner-script.ts). `script` has already been through
// wrappedCommand, so it is passed through as-is here rather than wrapped
// again.
export function ghosttyLaunchArgs(title: string, script: string, cols: number, rows: number): string[] {
  return [GHOSTTY_BIN, `--title=${title}`, `--window-decoration=none`, `--window-width=${cols}`, `--window-height=${rows}`, "--window-save-state=never", "--wait-after-command=false", "-e", "sh", "-c", script];
}

// Launches a new Ghostty process running `script` and returns its PID.
// Backgrounded (not spawnSync) since --wait-after-command keeps the process
// alive until the window is dismissed; we dismiss it ourselves after capture.
export function launchGhostty(title: string, script: string, cols: number, rows: number): number {
  const proc = Bun.spawn(ghosttyLaunchArgs(title, script, cols, rows), { stdout: "ignore", stderr: "ignore" });
  return proc.pid;
}

export function waitForWindow(pid: number, timeoutMs: number): number {
  const deadline = Date.now() + timeoutMs;
  let id = findWindowIdByPid(pid);
  while (id == null && Date.now() < deadline) {
    Bun.sleepSync(250);
    id = findWindowIdByPid(pid);
  }
  if (id == null) {
    throw new Error(`Ghostty process ${pid} did not open a window within ${timeoutMs}ms`);
  }
  return id;
}

// Always call this after a --run capture, success or failure, so the spawned
// window never lingers on a "press any key to close" screen.
export function closeGhosttyProcess(pid: number): void {
  try {
    process.kill(pid, "SIGTERM");
  } catch {
    /* already gone */
  }
}

function captureMac(opts: CaptureOptions): Uint8Array {
  const tmp = join(tmpdir(), `termshot-${process.pid}-${Date.now()}.png`);
  const args = ["screencapture", "-x", "-l", String(opts.windowId), "-o", tmp]; // -x: no capture sound; -l <id>: capture that window; -o: no window shadow

  const proc = Bun.spawnSync(args);
  if (!proc.success) {
    const err = new TextDecoder().decode(proc.stderr).trim();
    throw new Error(`screencapture failed: ${err || `exit ${proc.exitCode}`}`);
  }
  try {
    return new Uint8Array(readFileSync(tmp));
  } finally {
    try {
      unlinkSync(tmp);
    } catch {
      /* ignore */
    }
  }
}
