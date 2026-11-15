import { SHELL_SETTINGS } from "../shell/settings.ts";
import { THEME_SETTINGS } from "../theme/settings.ts";
import { RENDERING_SETTINGS } from "../rendering/settings.ts";
import { COMMAND_RUN_SETTINGS } from "../command-run/settings.ts";
import { PROMPT_SETTINGS } from "../prompt/settings.ts";
import { PUBLISHING_SETTINGS } from "../publishing/settings.ts";

// Every config key, in the order the spec's table lists them. A dotted key
// such as `font.size` is stored nested: {"font":{"size":18}}.
export const SETTINGS = {
  ...SHELL_SETTINGS,
  ...THEME_SETTINGS,
  ...RENDERING_SETTINGS,
  ...COMMAND_RUN_SETTINGS,
  ...PROMPT_SETTINGS,
  ...PUBLISHING_SETTINGS,
};

export type ConfigKey = keyof typeof SETTINGS;
export type Config = { [K in ConfigKey]: ReturnType<(typeof SETTINGS)[K]["parse"]> };
export type StoredConfig = Partial<Config>;

export const CONFIG_KEY_NAMES = Object.keys(SETTINGS) as ConfigKey[];

function isConfigKey(value: string): value is ConfigKey {
  return Object.hasOwn(SETTINGS, value);
}

export function parseConfigKey(value: string): ConfigKey {
  if (!isConfigKey(value)) {
    throw new Error(`unknown config key ${JSON.stringify(value)}; known keys: ${CONFIG_KEY_NAMES.join(", ")}`);
  }
  return value;
}

function parseValue<K extends ConfigKey>(key: K, value: unknown): Config[K] {
  return SETTINGS[key].parse(value) as Config[K];
}

function defaultValue<K extends ConfigKey>(key: K): Config[K] {
  return SETTINGS[key].default as Config[K];
}

function assign<K extends ConfigKey>(target: StoredConfig, key: K, value: Config[K]): void {
  target[key] = value;
}

function isPlainObject(raw: unknown): raw is Record<string, unknown> {
  return raw != null && typeof raw === "object" && !Array.isArray(raw);
}

// A name that some dotted key starts with, like `font` for `font.size`.
function isKeyGroup(name: string): boolean {
  return CONFIG_KEY_NAMES.some((key) => key.startsWith(`${name}.`));
}

function collect(raw: Record<string, unknown>, prefix: string, stored: StoredConfig): void {
  for (const [name, value] of Object.entries(raw)) {
    const path = `${prefix}${name}`;
    if (name.includes(".")) {
      throw new Error(`config key ${JSON.stringify(path)} must be nested in the file, like {"font":{"size":18}}`);
    } else if (!isConfigKey(path) && isKeyGroup(path) && isPlainObject(value)) {
      collect(value, `${path}.`, stored);
    } else {
      const key = parseConfigKey(path);
      assign(stored, key, parseValue(key, value));
    }
  }
}

export function parseStoredConfig(raw: unknown): StoredConfig {
  if (!isPlainObject(raw)) {
    throw new Error("config must be a JSON object");
  }
  const stored: StoredConfig = {};
  collect(raw, "", stored);
  return stored;
}

export function effectiveConfig(stored: StoredConfig): Config {
  const config: StoredConfig = {};
  for (const key of CONFIG_KEY_NAMES) {
    assign(config, key, stored[key] ?? defaultValue(key));
  }
  return config as Config;
}

export function setConfigValue(stored: StoredConfig, key: ConfigKey, value: unknown): StoredConfig {
  return { ...stored, [key]: parseValue(key, value) };
}

export function unsetConfigValue(stored: StoredConfig, key: ConfigKey): StoredConfig {
  const next = { ...stored };
  delete next[key];
  return next;
}
