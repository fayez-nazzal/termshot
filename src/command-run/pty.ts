import { constants } from "node:os";
import type { CommandRunner, CommandRunResult, RunRequest } from "./command-runner.ts";
import { idempotentDisposer, registerSignalSafeDisposal, type SignalPort } from "./disposal.ts";

// termios c_lflag bits. ECHO is the same everywhere; ECHOCTL is not.
const ECHO = 0x8;
const ECHOCTL = process.platform === "darwin" ? 0x40 : 0x200;
const END_OF_INPUT = "\x04";
const KILL_GRACE_MS = 500;
// After the command exits, wait this long at most for the terminal to report
// end of output. A background child that still holds the terminal would
// otherwise keep it open forever.
const OUTPUT_DRAIN_MS = 250;

// Resolves true when promise settles first, false when ms pass first. The
// timer is cleared so it never keeps the process alive.
function settlesWithin(promise: Promise<unknown>, ms: number): Promise<boolean> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), ms);
    void promise.then(() => {
      clearTimeout(timer);
      resolve(true);
    });
  });
}

// The command leads its own session and process group, so signalling the
// group also reaches the children it started.
function signalCommand(proc: Bun.Subprocess, signal: NodeJS.Signals): void {
  try {
    process.kill(-proc.pid, signal);
  } catch {
    try {
      proc.kill(signal);
    } catch {
      /* already gone */
    }
  }
}

function exitStatusOf(proc: Bun.Subprocess): number | null {
  let result: number | null = proc.exitCode;
  const signal = proc.signalCode;
  if (typeof signal === "number") {
    result = 128 + signal;
  } else if (signal != null) {
    result = 128 + constants.signals[signal];
  }
  return result;
}

function concat(chunks: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset = offset + chunk.length;
  }
  return result;
}

async function runInPty(request: RunRequest, signals: SignalPort): Promise<CommandRunResult> {
  const chunks: Uint8Array[] = [];
  let outputEnded!: () => void;
  const ended = new Promise<void>((resolve) => {
    outputEnded = resolve;
  });
  const startedAt = performance.now();
  // The terminal is created by spawn, not passed in prebuilt: a prebuilt one
  // keeps its own end open for reuse, so it never reports end of output.
  const proc = Bun.spawn(request.argv, {
    terminal: {
      cols: request.cols,
      rows: request.rows,
      data: (_terminal, data) => {
        chunks.push(data.slice());
      },
      exit: () => outputEnded(),
    },
    env: request.env,
    cwd: request.cwd,
  });
  const terminal = proc.terminal as Bun.Terminal;

  // Once the command is reaped its pid can be reused, so a late signal to
  // termshot must not kill anything; the listeners are removed then too.
  let reaped = false;
  let interrupted: NodeJS.Signals | null = null;
  const dispose = idempotentDisposer(() => {
    if (!reaped) {
      signalCommand(proc, "SIGKILL");
    }
  });
  const unregister = registerSignalSafeDisposal(dispose, signals, (signal) => {
    interrupted ??= signal;
  });

  // Echo off before sending end of input, so "^D" never reaches the output.
  // The command still sees a terminal on stdin, and anything reading it
  // finishes at once.
  terminal.localFlags = terminal.localFlags & ~(ECHO | ECHOCTL);
  terminal.write(END_OF_INPUT);

  const finished = await settlesWithin(proc.exited, request.timeoutMs);
  if (!finished) {
    signalCommand(proc, "SIGTERM");
    const stopped = await settlesWithin(proc.exited, KILL_GRACE_MS);
    if (!stopped) {
      signalCommand(proc, "SIGKILL");
      await proc.exited;
    }
  }
  reaped = true;
  unregister();
  await settlesWithin(ended, OUTPUT_DRAIN_MS);
  terminal.close();

  // A command killed because termshot was interrupted did not finish on its
  // own, so like a timed-out one it has no exit status.
  return {
    output: concat(chunks),
    exitStatus: finished && interrupted == null ? exitStatusOf(proc) : null,
    timedOut: !finished,
    durationMs: Math.round(performance.now() - startedAt),
    interrupted,
  };
}

export function ptyCommandRunner(signals: SignalPort): CommandRunner {
  return {
    run: (request) => runInPty(request, signals),
  };
}
