#!/usr/bin/env bun

import { parseArgs } from "node:util";
import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { captureScreen, launchGhostty, uniqueWindowTitle, waitForWindow, closeGhosttyProcess } from "./capture.ts";
import { publish, labelFromPath, DEFAULT_EMBED_WIDTH } from "./publish.ts";

export const VERSION = "0.5.0";

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

function fail(msg: string): never {
  process.stderr.write(`termshot: ${msg}\n`);
  process.exit(1);
}

function rejectRemovedFlags(argv: string[]): void {
  for (const raw of argv) {
    const name = raw.replace(/^--?/, "").split("=")[0]!;
    if (REMOVED_FLAGS.includes(name)) {
      fail(`--${name} was removed; termshot only supports --run`);
    }
  }
}

function main() {
  rejectRemovedFlags(process.argv.slice(2));

  let values: ReturnType<typeof parse>;
  try {
    values = parse();
  } catch (e) {
    fail((e as Error).message);
  }

  if (values.help) {
    process.stdout.write(HELP);
  } else if (values.version) {
    process.stdout.write(`${VERSION}\n`);
  } else {
    if (values.run == null) {
      fail("--run <command> is required");
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
      fail((e as Error).message);
    }

    const title = uniqueWindowTitle();
    let ghosttyPid: number;
    let windowId: number;
    try {
      ghosttyPid = launchGhostty(title, values.run, cols, rows);
      windowId = waitForWindow(ghosttyPid, 15000);
    } catch (e) {
      fail((e as Error).message);
    }
    Bun.sleepSync(settleMs);

    let png: Uint8Array;
    try {
      png = captureScreen({ windowId });
    } catch (e) {
      closeGhosttyProcess(ghosttyPid);
      fail((e as Error).message);
    }
    closeGhosttyProcess(ghosttyPid);

    let out = join(homedir(), "termshot", `${timestamp()}.png`);
    if (values.output != null) {
      out = values.output;
    }
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, png);
    process.stderr.write(`termshot: wrote ${out} (${png.length} bytes)\n`);
    if (values.publish != null) {
      let label = labelFromPath(out);
      if (values["publish-label"] != null) {
        label = values["publish-label"];
      }
      try {
        const published = publish({ filePath: out, dest: values.publish, isGif: false, size: publishSize, label });
        process.stdout.write(`${published.markdown}\n`);
      } catch (e) {
        fail(`wrote ${out}, but publish failed: ${(e as Error).message}`);
      }
    }
  }
}

if (import.meta.main) {
  main();
}
