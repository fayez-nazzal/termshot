import { expect, test } from "bun:test";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CONFIG_KEYS, CONFIG_KEY_NAMES, effectiveConfig, parseConfigKey, parseStoredConfig, setConfigValue, unsetConfigValue } from "../src/configuration/config.ts";
import { configPath, readStoredConfig, writeStoredConfig } from "../src/configuration/config-store.ts";
import { parseConfigCommand } from "../src/invocation/config-command.ts";
import { DEFAULT_PUBLISHER_ID } from "../src/publishing/registry.ts";
import { DEFAULT_TERMINAL_ID } from "../src/terminal-emulator/registry.ts";

test("an empty stored config resolves to the defaults", () => {
  expect(effectiveConfig({})).toEqual({ terminal: DEFAULT_TERMINAL_ID, publisher: DEFAULT_PUBLISHER_ID });
  for (const key of CONFIG_KEY_NAMES) {
    expect(effectiveConfig({})[key]).toBe(CONFIG_KEYS[key].default);
  }
});

test("set validates through the key's own parser", () => {
  expect(setConfigValue({}, "terminal", "alacritty")).toEqual({ terminal: "alacritty" });
  expect(() => setConfigValue({}, "terminal", "kitty")).toThrow(/unknown terminal/);
  expect(setConfigValue({ terminal: "alacritty" }, "publisher", "gh")).toEqual({ terminal: "alacritty", publisher: "gh" });
  expect(() => setConfigValue({}, "publisher", "s3")).toThrow(/unknown publisher/);
});

test("unset removes only that key and does not mutate the input", () => {
  const stored = { terminal: "alacritty" as const };
  expect(unsetConfigValue(stored, "terminal")).toEqual({});
  expect(stored).toEqual({ terminal: "alacritty" });
});

test("a stored config with an unknown key or a bad value fails loudly", () => {
  expect(() => parseStoredConfig({ termnial: "alacritty" })).toThrow(/unknown config key "termnial"/);
  expect(() => parseStoredConfig({ terminal: "kitty" })).toThrow(/unknown terminal/);
  expect(() => parseStoredConfig([])).toThrow(/JSON object/);
  expect(parseStoredConfig({ terminal: "alacritty" })).toEqual({ terminal: "alacritty" });
});

test("parseConfigKey rejects prototype names", () => {
  expect(() => parseConfigKey("constructor")).toThrow(/unknown config key/);
});

test("configPath follows XDG_CONFIG_HOME, falling back to ~/.config", () => {
  expect(configPath({ XDG_CONFIG_HOME: "/x" }, "/home/u")).toBe("/x/termshot/config.json");
  expect(configPath({}, "/home/u")).toBe("/home/u/.config/termshot/config.json");
  expect(configPath({ XDG_CONFIG_HOME: "" }, "/home/u")).toBe("/home/u/.config/termshot/config.json");
});

test("the store round-trips, treats a missing file as empty, and names the file on a bad one", () => {
  const dir = mkdtempSync(join(tmpdir(), "termshot-config-test-"));
  const path = join(dir, "nested", "config.json");
  expect(readStoredConfig(path)).toEqual({});
  writeStoredConfig(path, { terminal: "alacritty" });
  expect(readStoredConfig(path)).toEqual({ terminal: "alacritty" });
  writeFileSync(path, "{not json");
  expect(() => readStoredConfig(path)).toThrow(path);
});

test("parseConfigCommand accepts show, set and unset, and nothing else", () => {
  expect(parseConfigCommand([])).toEqual({ ok: true, command: { action: "show" } });
  expect(parseConfigCommand(["set", "terminal", "alacritty"])).toEqual({ ok: true, command: { action: "set", key: "terminal", value: "alacritty" } });
  expect(parseConfigCommand(["unset", "terminal"])).toEqual({ ok: true, command: { action: "unset", key: "terminal" } });
  expect(parseConfigCommand(["set", "terminal"]).ok).toBe(false);
  expect(parseConfigCommand(["set", "nope", "x"])).toEqual({ ok: false, message: expect.stringContaining("unknown config key") });
  expect(parseConfigCommand(["frobnicate"]).ok).toBe(false);
});

// End to end through the real CLI, against an isolated config dir.
function cli(args: string[], configHome: string) {
  const proc = Bun.spawnSync(["bun", "src/cli.ts", ...args], { env: { ...process.env, XDG_CONFIG_HOME: configHome } });
  return { exitCode: proc.exitCode, stdout: new TextDecoder().decode(proc.stdout), stderr: new TextDecoder().decode(proc.stderr) };
}

test("termshot config set/unset persists the value and prints one JSON line", () => {
  const home = mkdtempSync(join(tmpdir(), "termshot-cli-config-"));
  const file = join(home, "termshot", "config.json");

  const shown = cli(["config"], home);
  expect(shown.exitCode).toBe(0);
  expect(JSON.parse(shown.stdout)).toMatchObject({ tool: "termshot", configPath: file, config: { terminal: DEFAULT_TERMINAL_ID, publisher: DEFAULT_PUBLISHER_ID } });

  const set = cli(["config", "set", "terminal", "alacritty"], home);
  expect(set.exitCode).toBe(0);
  expect(set.stdout.trim().split("\n").length).toBe(1);
  expect(JSON.parse(set.stdout).config).toEqual({ terminal: "alacritty", publisher: DEFAULT_PUBLISHER_ID });
  expect(JSON.parse(readFileSync(file, "utf8"))).toEqual({ terminal: "alacritty" });

  const unset = cli(["config", "unset", "terminal"], home);
  expect(JSON.parse(unset.stdout).config).toEqual({ terminal: DEFAULT_TERMINAL_ID, publisher: DEFAULT_PUBLISHER_ID });
  expect(JSON.parse(readFileSync(file, "utf8"))).toEqual({});
});

test("a capture with a malformed --publish dest fails as a usage error before any window opens", () => {
  const home = mkdtempSync(join(tmpdir(), "termshot-cli-config-"));
  cli(["config", "set", "publisher", "rclone"], home);
  const run = cli(["--run", "echo hi", "-o", "/tmp/never.png", "--publish", "PR-Shots/"], home);
  expect(run.exitCode).toBe(2);
  const record = JSON.parse(run.stdout);
  expect(record.errors[0]).toEqual({ step: "flags", message: expect.stringContaining("remote:path") });
  expect(record.terminal.emulator).toBeNull();
});

test("termshot config set with a bad value is a usage error and writes nothing", () => {
  const home = mkdtempSync(join(tmpdir(), "termshot-cli-config-"));
  const bad = cli(["config", "set", "terminal", "kitty"], home);
  expect(bad.exitCode).toBe(2);
  expect(JSON.parse(bad.stdout)).toMatchObject({ status: "usage-error", errors: [{ step: "config" }] });
  expect(() => readFileSync(join(home, "termshot", "config.json"))).toThrow();
});

test("a broken config file stops a capture with a usage error that names the file", () => {
  const home = mkdtempSync(join(tmpdir(), "termshot-cli-config-"));
  mkdirSync(join(home, "termshot"));
  writeFileSync(join(home, "termshot", "config.json"), JSON.stringify({ terminal: "kitty" }));
  const run = cli(["--run", "echo hi", "-o", "/tmp/never.png"], home);
  expect(run.exitCode).toBe(2);
  const record = JSON.parse(run.stdout);
  expect(record.errors[0].step).toBe("config");
  expect(record.errors[0].message).toContain(join(home, "termshot", "config.json"));
});
