import { DEFAULT_PUBLISHER_ID, PUBLISHER_IDS, parsePublisherId } from "../publishing/registry.ts";
import { DEFAULT_TERMINAL_ID, TERMINAL_IDS, parseTerminalId } from "../terminal-emulator/registry.ts";

interface ConfigKeyDefinition<T> {
  readonly default: T;
  readonly description: string;
  parse(value: unknown): T;
}

export const CONFIG_KEYS = {
  terminal: {
    default: DEFAULT_TERMINAL_ID,
    description: `Terminal emulator captures run in: ${TERMINAL_IDS.join(", ")}`,
    parse: parseTerminalId,
  },
  publisher: {
    default: DEFAULT_PUBLISHER_ID,
    description: `Where --publish uploads: ${PUBLISHER_IDS.join(", ")}`,
    parse: parsePublisherId,
  },
} as const satisfies Record<string, ConfigKeyDefinition<unknown>>;

export type ConfigKey = keyof typeof CONFIG_KEYS;
export type Config = { [K in ConfigKey]: ReturnType<(typeof CONFIG_KEYS)[K]["parse"]> };
export type StoredConfig = Partial<Config>;

export const CONFIG_KEY_NAMES = Object.keys(CONFIG_KEYS) as ConfigKey[];

export function parseConfigKey(value: string): ConfigKey {
  if (!Object.hasOwn(CONFIG_KEYS, value)) {
    throw new Error(`unknown config key ${JSON.stringify(value)}; known keys: ${CONFIG_KEY_NAMES.join(", ")}`);
  }
  return value as ConfigKey;
}

function parseValue<K extends ConfigKey>(key: K, value: unknown): Config[K] {
  return CONFIG_KEYS[key].parse(value) as Config[K];
}

function defaultValue<K extends ConfigKey>(key: K): Config[K] {
  return CONFIG_KEYS[key].default as Config[K];
}

function assign<K extends ConfigKey>(target: StoredConfig, key: K, value: Config[K]): void {
  target[key] = value;
}

function isPlainObject(raw: unknown): raw is Record<string, unknown> {
  return raw != null && typeof raw === "object" && !Array.isArray(raw);
}

export function parseStoredConfig(raw: unknown): StoredConfig {
  if (!isPlainObject(raw)) {
    throw new Error("config must be a JSON object");
  }
  const stored: StoredConfig = {};
  for (const [name, value] of Object.entries(raw)) {
    const key = parseConfigKey(name);
    assign(stored, key, parseValue(key, value));
  }
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
