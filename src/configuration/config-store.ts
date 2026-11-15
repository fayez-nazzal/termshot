import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { parseStoredConfig } from "./config.ts";
import type { StoredConfig } from "./config.ts";

export function configPath(env: Record<string, string | undefined> = process.env, home: string = homedir()): string {
  let base = join(home, ".config");
  if (env.XDG_CONFIG_HOME != null && env.XDG_CONFIG_HOME !== "") {
    base = env.XDG_CONFIG_HOME;
  }
  return join(base, "termshot", "config.json");
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

export function writeStoredConfig(path: string, stored: StoredConfig): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(stored, null, 2)}\n`);
}
