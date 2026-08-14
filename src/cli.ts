#!/usr/bin/env bun

import { parseArgs } from "node:util";
import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { captureScreen, listWindows, launchGhostty, uniqueWindowTitle, waitForWindow, closeGhosttyProcess } from "./capture.ts";
import { drawAnnotations, parseBoxFlag, parseMarkerFlag, type BoxAnnotation, type MarkerAnnotation } from "./annotate.ts";
import { publish, labelFromPath, DEFAULT_EMBED_WIDTH } from "./publish.ts";

export const VERSION = "0.5.0";

export const DEFAULT_RUN_COLS = 120;
export const DEFAULT_RUN_ROWS = 30;

const HELP = `termshot ${VERSION} — capture the screen to a PNG

USAGE
  termshot [options]

  Captures the screen via the OS (macOS: screencapture).
  Default: the whole display. Use -w to pick a window interactively,
  --window <id|name> to capture one specific window non-interactively
  (works from a background/parallel shell), or --run <command> to run a
  command in a fresh Ghostty window and capture that.

OPTIONS
  -o, --output <path>     Output PNG path (default: ~/termshot/<timestamp>.png)
      --stdout            Write PNG bytes to stdout instead of a file
  -w, --window-pick       Pick a window interactively (macOS)
      --window <id|name>  Capture a specific window non-interactively (macOS).
                          Numeric = CGWindowID; otherwise matched against
                          window title/owner (see --list).
      --run <command>     Run the command in a new Ghostty window (unique
                          title, wait-after-command) and capture that window
      --settle <ms>       Wait after the Ghostty window appears before
                          capturing (default: 500)
      --cols <n>          --run window width in terminal columns (default: ${DEFAULT_RUN_COLS})
      --rows <n>          --run window height in terminal rows (default: ${DEFAULT_RUN_ROWS})
      --list              List on-screen windows (id  layer  owner  title)
      --box <x,y,w,h[,color]>  Draw a rectangle outline on the PNG at those
                          pixel coordinates (top-left origin); repeatable
      --marker <x,y[,color]>   Draw a point marker (filled dot) on the PNG
                          at that pixel coordinate; repeatable
      --annotate          Open the written PNG in CleanShot for annotation
      --copy              Put the written PNG on the macOS clipboard
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
      stdout: { type: "boolean", default: false },
      window: { type: "string" },
      "window-pick": { type: "boolean", short: "w", default: false },
      run: { type: "string" },
      settle: { type: "string" },
      cols: { type: "string" },
      rows: { type: "string" },
      list: { type: "boolean", default: false },
      box: { type: "string", multiple: true, default: [] },
      marker: { type: "string", multiple: true, default: [] },
      annotate: { type: "boolean", default: false },
      copy: { type: "boolean", default: false },
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

export function cleanshotAnnotateUrl(filePath: string): string {
  return `cleanshot://open-annotate?filepath=${encodeURIComponent(filePath)}`;
}

export function clipboardScript(filePath: string): string {
  const escaped = filePath.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `set the clipboard to (read (POSIX file "${escaped}") as «class PNGf»)`;
}

function openInCleanshot(filePath: string): void {
  const proc = Bun.spawnSync(["open", "-g", cleanshotAnnotateUrl(filePath)]);
  if (!proc.success) {
    const err = new TextDecoder().decode(proc.stderr).trim();
    const detail = err || `exit ${proc.exitCode}`;
    throw new Error(`could not open CleanShot annotate: ${detail}`);
  }
}

function copyPngToClipboard(filePath: string): void {
  const proc = Bun.spawnSync(["osascript", "-e", clipboardScript(filePath)]);
  if (!proc.success) {
    const err = new TextDecoder().decode(proc.stderr).trim();
    const detail = err || `exit ${proc.exitCode}`;
    throw new Error(`could not copy PNG to clipboard: ${detail}`);
  }
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

function main() {
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
  } else if (values.list) {
    let wins;
    try {
      wins = listWindows();
    } catch (e) {
      fail((e as Error).message);
    }
    for (const w of wins) {
      process.stdout.write(`${String(w.id).padEnd(8)} L${String(w.layer).padEnd(4)} ${w.owner}\t${w.name}\n`);
    }
  } else {
    if (values.run != null && (values.window != null || values["window-pick"])) {
      fail("--run cannot be combined with --window or -w");
    }
    if (values.stdout && (values.annotate || values.copy)) {
      fail("--stdout cannot be combined with --annotate or --copy");
    }
    if (values.publish != null && values.stdout) {
      fail("--publish needs a written file; it cannot be combined with --stdout");
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

    const boxes: BoxAnnotation[] = [];
    const markers: MarkerAnnotation[] = [];
    try {
      for (const raw of values.box) {
        boxes.push(parseBoxFlag(raw));
      }
      for (const raw of values.marker) {
        markers.push(parseMarkerFlag(raw));
      }
    } catch (e) {
      fail((e as Error).message);
    }

    let windowId: number | undefined;
    let match: string | undefined;
    if (values.window != null) {
      const n = Number(values.window);
      if (Number.isInteger(n) && String(n) === values.window.trim()) {
        windowId = n;
      } else {
        match = values.window;
      }
    }

    let ghosttyPid: number | undefined;
    if (values.run != null) {
      const title = uniqueWindowTitle();
      try {
        ghosttyPid = launchGhostty(title, values.run, cols, rows);
        windowId = waitForWindow(ghosttyPid, 15000);
      } catch (e) {
        fail((e as Error).message);
      }
      Bun.sleepSync(settleMs);
    }

    let png: Uint8Array;
    try {
      png = captureScreen({
        window: Boolean(values["window-pick"]),
        windowId,
        match,
      });
    } catch (e) {
      if (ghosttyPid != null) {
        closeGhosttyProcess(ghosttyPid);
      }
      fail((e as Error).message);
    }
    if (ghosttyPid != null) {
      closeGhosttyProcess(ghosttyPid);
    }

    try {
      png = drawAnnotations(png, boxes, markers);
    } catch (e) {
      fail((e as Error).message);
    }

    if (values.stdout) {
      process.stdout.write(png);
    } else {
      let out = join(homedir(), "termshot", `${timestamp()}.png`);
      if (values.output != null) {
        out = values.output;
      }
      mkdirSync(dirname(out), { recursive: true });
      writeFileSync(out, png);
      try {
        if (values.annotate) {
          openInCleanshot(out);
        }
        if (values.copy) {
          copyPngToClipboard(out);
        }
      } catch (e) {
        fail(`wrote ${out}, but ${(e as Error).message}`);
      }
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
}

if (import.meta.main) {
  main();
}
