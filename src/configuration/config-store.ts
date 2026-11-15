import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { CONFIG_KEY_NAMES, parseStoredConfig } from "./config.ts";
import type { StoredConfig } from "./config.ts";

// Turns dotted keys into nested objects, in the registry's key order:
// {"font.size": 18} becomes {"font":{"size":18}}.
function nest(stored: StoredConfig): Record<string, unknown> {
  const nested: Record<string, unknown> = {};
  for (const key of CONFIG_KEY_NAMES) {
    if (stored[key] !== undefined) {
      const segments = key.split(".");
      let target = nested;
      for (const segment of segments.slice(0, -1)) {
        target[segment] ??= {};
        target = target[segment] as Record<string, unknown>;
      }
      target[segments[segments.length - 1]!] = stored[key];
    }
  }
  return nested;
}

export function readStoredConfig(path: string): StoredConfig {
  let stored: StoredConfig = {};
  if (existsSync(path)) {
    try {
      stored = parseStoredConfig(JSON.parse(readFileSync(path, "utf8")));
    } catch (e) {
      throw new Error(`${path}: ${(e as Error).message}`);
    }
  }
  return stored;
}

// The folder must already exist; ensureTermshotDir makes it with its .gitignore.
export function writeStoredConfig(path: string, stored: StoredConfig): void {
  writeFileSync(path, `${JSON.stringify(nest(stored), null, 2)}\n`);
}
