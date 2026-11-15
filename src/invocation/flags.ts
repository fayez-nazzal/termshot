import { parseArgs } from "node:util";
import { DEFAULT_EMBED_WIDTH } from "../publishing/publisher.ts";
import { parsePublisherId } from "../publishing/registry.ts";
import type { Invocation } from "./invocation.ts";

const REMOVED_FLAGS = ["annotate", "copy", "window-pick", "box", "marker", "list", "window", "stdout", "terminal", "settle"];

export type FlagsResult = { ok: true; invocation: Invocation; help: boolean; version: boolean } | { ok: false; message: string };

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

function intFlag(name: string, raw: string): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`--${name} must be a positive integer`);
  }
  return n;
}

function parseArgv(argv: string[]) {
  return parseArgs({
    args: argv,
    options: {
      output: { type: "string", short: "o" },
      run: { type: "string" },
      cols: { type: "string" },
      rows: { type: "string" },
      publish: { type: "string" },
      "publish-size": { type: "string" },
      "publish-label": { type: "string" },
      publisher: { type: "string" },
      help: { type: "boolean", short: "h", default: false },
      version: { type: "boolean", short: "v", default: false },
    },
    allowPositionals: false,
  }).values;
}

export function parseFlags(argv: string[]): FlagsResult {
  let result: FlagsResult;
  const removedFlag = findRemovedFlag(argv);
  if (removedFlag != null) {
    result = { ok: false, message: `--${removedFlag} was removed; termshot only supports --run` };
  } else {
    try {
      const values = parseArgv(argv);
      if (values.help || values.version) {
        result = {
          ok: true,
          help: Boolean(values.help),
          version: Boolean(values.version),
          invocation: { command: "", output: null, cols: null, rows: null, publishDest: null, publishSize: DEFAULT_EMBED_WIDTH, publishLabel: null, publisher: null },
        };
      } else if (values.run == null) {
        result = { ok: false, message: "--run <command> is required" };
      } else if (values.publisher != null && values.publish == null) {
        result = { ok: false, message: "--publisher only applies with --publish <dest>" };
      } else {
        const invocation: Invocation = {
          command: values.run,
          output: values.output ?? null,
          cols: values.cols != null ? intFlag("cols", values.cols) : null,
          rows: values.rows != null ? intFlag("rows", values.rows) : null,
          publishDest: values.publish ?? null,
          publishSize: values["publish-size"] != null ? intFlag("publish-size", values["publish-size"]) : DEFAULT_EMBED_WIDTH,
          publishLabel: values["publish-label"] ?? null,
          publisher: values.publisher != null ? parsePublisherId(values.publisher) : null,
        };
        result = { ok: true, help: false, version: false, invocation };
      }
    } catch (e) {
      result = { ok: false, message: (e as Error).message };
    }
  }
  return result;
}
