import { parseConfigKey } from "../configuration/config.ts";
import type { ConfigKey } from "../configuration/config.ts";

export type ConfigCommand = { action: "show" } | { action: "set"; key: ConfigKey; value: string } | { action: "unset"; key: ConfigKey };

export type ConfigCommandResult = { ok: true; command: ConfigCommand } | { ok: false; message: string };

export const CONFIG_USAGE = "usage: termshot config [set <key> <value> | unset <key>]";

export function parseConfigCommand(args: string[]): ConfigCommandResult {
  let result: ConfigCommandResult;
  const [action, ...rest] = args;
  try {
    if (action == null || (action === "show" && rest.length === 0)) {
      result = { ok: true, command: { action: "show" } };
    } else if (action === "set" && rest.length === 2) {
      result = { ok: true, command: { action: "set", key: parseConfigKey(rest[0]!), value: rest[1]! } };
    } else if (action === "unset" && rest.length === 1) {
      result = { ok: true, command: { action: "unset", key: parseConfigKey(rest[0]!) } };
    } else {
      result = { ok: false, message: CONFIG_USAGE };
    }
  } catch (e) {
    result = { ok: false, message: (e as Error).message };
  }
  return result;
}
