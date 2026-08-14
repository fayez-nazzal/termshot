#!/usr/bin/env bun

import { parseArgs } from "node:util";
import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { captureScreen, launchGhostty, uniqueWindowTitle, waitForWindow, closeGhosttyProcess } from "./capture.ts";
import { publish, labelFromPath, DEFAULT_EMBED_WIDTH } from "./publish.ts";
import { buildResult } from "./run-result/build.ts";
import { emit } from "./run-result/emit.ts";
import { exitCodeFor } from "./run-result/exit-codes.ts";
import type { RunResult, RunStatus } from "./run-result/result.ts";

export const VERSION = "0.5.0";
const TOOL = "termshot";

export const DEFAULT_RUN_COLS = 120;
export const DEFAULT_RUN_ROWS = 30;

const REMOVED_FLAGS = ["annotate", "copy", "window-pick", "box", "marker", "list", "window", "stdout"];

const HELP = `termshot ${VERSION} — run a command in a fresh terminal window and capture it

USAGE
  termshot --run <command> [options]

  Runs the command in a new Ghostty window (unique title, wait-after-command)
  and captures that window via the OS (macOS: screencapture).

OPTIONS
      --run <command>     Run the command in a new Ghostty window and capture it
  -o, --output <path>     Output PNG path (default: ~/termshot/<timestamp>.png)
      --settle <ms>       Wait after the Ghostty window appears before
                          capturing (default: 500)
      --cols <n>          --run window width in terminal columns (default: ${DEFAULT_RUN_COLS})
      --rows <n>          --run window height in terminal rows (default: ${DEFAULT_RUN_ROWS})
      --publish <dest>    Upload the written PNG to an rclone remote dir (e.g.
                          gdrive:PR-Shots/<repo>/<branch>/), make it public,
                          and print a high-res PR-ready inline Drive image
                          embed to stdout
      --publish-size <px>     Long-edge width for the embed (default: ${DEFAULT_EMBED_WIDTH})
      --publish-label <text>  Alt text for the embed (default: file name)
  -h, --help              Show this help
  -v, --version           Show version
`;

function parse() {
  return parseArgs({
    options: {
      output: { type: "string", short: "o" },
      run: { type: "string" },
      settle: { type: "string" },
      cols: { type: "string" },
      rows: { type: "string" },
      publish: { type: "string" },
      "publish-size": { type: "string" },
      "publish-label": { type: "string" },
      help: { type: "boolean", short: "h", default: false },
      version: { type: "boolean", short: "v", default: false },
    },
    allowPositionals: false,
  }).values;
}

function timestamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function intFlag(name: string, raw: string): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`--${name} must be a positive integer`);
  }
  return n;
}

function finish(status: RunStatus, step: string, message?: string): never {
  const errors = [];
  if (message != null) {
    errors.push({ step, message });
  }
  const result = buildResult({ tool: TOOL, version: VERSION, status, errors });
  emit(result);
  process.exit(exitCodeFor(result));
}

function findRemovedFlag(argv: string[]): string | undefined {
  let result: string | undefined;
  for (const raw of argv) {
    const name = raw.replace(/^--?/, "").split("=")[0]!;
    if (result == null && REMOVED_FLAGS.includes(name)) {
      result = name;
    }
  }
  return result;
}

function main() {
  const removedFlag = findRemovedFlag(process.argv.slice(2));
  if (removedFlag != null) {
    finish("usage-error", "flags", `--${removedFlag} was removed; termshot only supports --run`);
  }

  let values: ReturnType<typeof parse>;
  try {
    values = parse();
  } catch (e) {
    finish("usage-error", "flags", (e as Error).message);
  }

  if (values.help) {
    process.stdout.write(HELP);
  } else if (values.version) {
    process.stdout.write(`${VERSION}\n`);
  } else {
    if (values.run == null) {
      finish("usage-error", "flags", "--run <command> is required");
    }

    let settleMs = 500;
    let cols = DEFAULT_RUN_COLS;
    let rows = DEFAULT_RUN_ROWS;
    let publishSize = DEFAULT_EMBED_WIDTH;
    try {
      if (values.settle != null) {
        settleMs = intFlag("settle", values.settle);
      }
      if (values.cols != null) {
        cols = intFlag("cols", values.cols);
      }
      if (values.rows != null) {
        rows = intFlag("rows", values.rows);
      }
      if (values["publish-size"] != null) {
        publishSize = intFlag("publish-size", values["publish-size"]);
      }
    } catch (e) {
      finish("usage-error", "flags", (e as Error).message);
    }

    const title = uniqueWindowTitle();
    let ghosttyPid: number;
    let windowId: number;
    try {
      ghosttyPid = launchGhostty(title, values.run, cols, rows);
      windowId = waitForWindow(ghosttyPid, 15000);
    } catch (e) {
      finish("environment-error", "terminal-session", (e as Error).message);
    }
    Bun.sleepSync(settleMs);

    let png: Uint8Array;
    try {
      png = captureScreen({ windowId });
    } catch (e) {
      closeGhosttyProcess(ghosttyPid);
      finish("environment-error", "screen-capture", (e as Error).message);
    }
    closeGhosttyProcess(ghosttyPid);

    let out = join(homedir(), "termshot", `${timestamp()}.png`);
    if (values.output != null) {
      out = values.output;
    }
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, png);

    let result: RunResult;
    if (values.publish != null) {
      let label = labelFromPath(out);
      if (values["publish-label"] != null) {
        label = values["publish-label"];
      }
      try {
        const published = publish({ filePath: out, dest: values.publish, isGif: false, size: publishSize, label });
        result = buildResult({
          tool: TOOL,
          version: VERSION,
          status: "ok",
          capture: { path: out, bytes: png.length },
          publish: { requested: true, url: published.url, markdown: published.markdown, verified: true },
        });
      } catch (e) {
        result = buildResult({
          tool: TOOL,
          version: VERSION,
          status: "publish-failed",
          capture: { path: out, bytes: png.length },
          publish: { requested: true },
          errors: [{ step: "publish", message: (e as Error).message }],
        });
      }
    } else {
      result = buildResult({
        tool: TOOL,
        version: VERSION,
        status: "ok",
        capture: { path: out, bytes: png.length },
      });
    }
    emit(result);
    process.exit(exitCodeFor(result));
  }
}

if (import.meta.main) {
  main();
}
