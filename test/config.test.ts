import { expect, test } from "bun:test";
import { mkdtempSync, readFileSync, readdirSync, realpathSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SETTINGS, CONFIG_KEY_NAMES, effectiveConfig, parseConfigKey, parseStoredConfig, setConfigValue, unsetConfigValue } from "../src/configuration/config.ts";
import { readStoredConfig, writeStoredConfig } from "../src/configuration/config-store.ts";
import { parseConfigCommand } from "../src/invocation/config-command.ts";

const CLI = join(import.meta.dir, "..", "src", "cli.ts");

function tempDir(): string {
  return realpathSync(mkdtempSync(join(tmpdir(), "termshot-config-test-")));
}

test("defaults match the spec table", () => {
  expect(effectiveConfig({})).toEqual({ shell: "zsh", theme: "dark", "font.size": 18, cols: 120, rows: 30, "prompt.show": true, "prompt.directory": "full", "prompt.git": true, "prompt.symbol": "❯", publisher: "rclone" });
  expect(CONFIG_KEY_NAMES).toEqual(["shell", "theme", "font.size", "cols", "rows", "prompt.show", "prompt.directory", "prompt.git", "prompt.symbol", "publisher"]);
  for (const key of CONFIG_KEY_NAMES) {
    expect(effectiveConfig({})[key]).toBe(SETTINGS[key].default);
  }
});

test("set validates through the key's own parser", () => {
  expect(setConfigValue({}, "theme", "light")).toEqual({ theme: "light" });
  expect(() => setConfigValue({}, "theme", "sepia")).toThrow(/unknown theme/);
  expect(setConfigValue({ theme: "light" }, "publisher", "gh")).toEqual({ theme: "light", publisher: "gh" });
  expect(() => setConfigValue({}, "publisher", "s3")).toThrow(/unknown publisher/);
});

test("bad values are rejected", () => {
  expect(() => setConfigValue({}, "font.size", "9")).toThrow();
  expect(() => setConfigValue({}, "prompt.symbol", "")).toThrow();
  expect(() => setConfigValue({}, "prompt.symbol", "abcde")).toThrow();
  expect(() => setConfigValue({}, "prompt.show", "yes")).toThrow();
});

test("unset removes only that key and does not mutate the input", () => {
  const stored = { theme: "light" as const, "font.size": 20 };
  expect(unsetConfigValue(stored, "theme")).toEqual({ "font.size": 20 });
  expect(stored).toEqual({ theme: "light", "font.size": 20 });
});

test("a stored config with an unknown key or a bad value fails loudly", () => {
  expect(() => parseStoredConfig({ terminal: "any" })).toThrow(/unknown config key "terminal"/);
  expect(() => parseStoredConfig({ theme: "sepia" })).toThrow(/unknown theme/);
  expect(() => parseStoredConfig({ font: { size: 9 } })).toThrow(/10 to 48/);
  expect(() => parseStoredConfig({ font: 18 })).toThrow(/unknown config key "font"/);
  expect(() => parseStoredConfig([])).toThrow(/JSON object/);
  expect(parseStoredConfig({ theme: "light", prompt: { show: false, symbol: "$" } })).toEqual({ theme: "light", "prompt.show": false, "prompt.symbol": "$" });
});

test("a flat dotted key in the file is rejected, so there is one way to write it", () => {
  expect(() => parseStoredConfig({ "font.size": 20 })).toThrow('config key "font.size" must be nested in the file, like {"font":{"size":18}}');
  expect(() => parseStoredConfig({ "prompt.show": false })).toThrow('like {"prompt":{"show":true}}');
});

test("a dotted name that is not a config key is just unknown", () => {
  expect(() => parseStoredConfig({ "foo.bar": 1 })).toThrow('unknown config key "foo.bar"');
  expect(() => parseStoredConfig({ font: { "a.b": 1 } })).toThrow('unknown config key "font.a.b"');
});

test("unknown nested key is rejected with its dotted name", () => {
  expect(() => parseStoredConfig({ font: { colour: 1 } })).toThrow('unknown config key "font.colour"');
});

test("parseConfigKey rejects prototype names", () => {
  expect(() => parseConfigKey("constructor")).toThrow(/unknown config key/);
  expect(() => parseStoredConfig({ font: { constructor: 1 } })).toThrow(/unknown config key "font.constructor"/);
});

test("dotted keys round-trip through nested JSON", () => {
  const path = join(tempDir(), "config.json");
  const stored = setConfigValue({}, "font.size", "20");
  writeStoredConfig(path, stored);
  expect(JSON.parse(readFileSync(path, "utf8"))).toEqual({ font: { size: 20 } });
  expect(readStoredConfig(path)).toEqual({ "font.size": 20 });
});

test("the store writes 2-space nested JSON with a trailing newline, in key order", () => {
  const path = join(tempDir(), "config.json");
  writeStoredConfig(path, { "prompt.git": false, theme: "light", "prompt.show": false });
  expect(readFileSync(path, "utf8")).toBe(`${JSON.stringify({ theme: "light", prompt: { show: false, git: false } }, null, 2)}\n`);
});

test("the store treats a missing file as empty and names the file on a bad one", () => {
  const path = join(tempDir(), "config.json");
  expect(readStoredConfig(path)).toEqual({});
  writeFileSync(path, "{not json");
  expect(() => readStoredConfig(path)).toThrow(path);
});

test("parseConfigCommand accepts show, set and unset, and nothing else", () => {
  expect(parseConfigCommand([])).toEqual({ ok: true, command: { action: "show" } });
  expect(parseConfigCommand(["set", "font.size", "20"])).toEqual({ ok: true, command: { action: "set", key: "font.size", value: "20" } });
  expect(parseConfigCommand(["unset", "theme"])).toEqual({ ok: true, command: { action: "unset", key: "theme" } });
  expect(parseConfigCommand(["set", "theme"]).ok).toBe(false);
  expect(parseConfigCommand(["set", "terminal", "x"])).toEqual({ ok: false, message: expect.stringContaining("unknown config key") });
  expect(parseConfigCommand(["frobnicate"]).ok).toBe(false);
});

// End to end through the real CLI, run from an isolated folder that is not a git repo.
function cli(args: string[], cwd: string) {
  const proc = Bun.spawnSync(["bun", CLI, ...args], { cwd });
  return { exitCode: proc.exitCode, stdout: new TextDecoder().decode(proc.stdout), stderr: new TextDecoder().decode(proc.stderr) };
}

test("config set from a plain folder creates .termshot there and nothing else", () => {
  const tmp = tempDir();
  const set = cli(["config", "set", "theme", "light"], tmp);
  expect(set.exitCode).toBe(0);
  expect(readdirSync(tmp)).toEqual([".termshot"]);
  expect(readdirSync(join(tmp, ".termshot")).sort()).toEqual([".gitignore", "config.json"]);
  expect(JSON.parse(readFileSync(join(tmp, ".termshot", "config.json"), "utf8"))).toEqual({ theme: "light" });
  expect(readFileSync(join(tmp, ".termshot", ".gitignore"), "utf8")).toBe("captures/\n");
});

test("config show from a plain folder writes nothing and reports where set would write", () => {
  const tmp = tempDir();
  const shown = cli(["config"], tmp);
  expect(shown.exitCode).toBe(0);
  expect(JSON.parse(shown.stdout)).toMatchObject({ tool: "termshot", configPath: join(tmp, ".termshot", "config.json"), config: effectiveConfig({}) });
  expect(readdirSync(tmp)).toEqual([]);
});

test("config unset from a plain folder creates nothing", () => {
  const tmp = tempDir();
  const unset = cli(["config", "unset", "theme"], tmp);
  expect(unset.exitCode).toBe(0);
  expect(JSON.parse(unset.stdout).config).toEqual(effectiveConfig({}));
  expect(readdirSync(tmp)).toEqual([]);
});

test("termshot config set/unset in a subfolder uses the nearest .termshot and prints one JSON line", () => {
  const tmp = tempDir();
  mkdirSync(join(tmp, ".termshot"));
  mkdirSync(join(tmp, "sub"));
  const file = join(tmp, ".termshot", "config.json");

  const set = cli(["config", "set", "font.size", "20"], join(tmp, "sub"));
  expect(set.exitCode).toBe(0);
  expect(set.stdout.trim().split("\n").length).toBe(1);
  expect(JSON.parse(set.stdout)).toMatchObject({ configPath: file, config: { ...effectiveConfig({}), "font.size": 20 } });
  expect(JSON.parse(readFileSync(file, "utf8"))).toEqual({ font: { size: 20 } });

  const unset = cli(["config", "unset", "font.size"], join(tmp, "sub"));
  expect(JSON.parse(unset.stdout).config).toEqual(effectiveConfig({}));
  expect(JSON.parse(readFileSync(file, "utf8"))).toEqual({});
});

test("a capture with a malformed --publish dest fails as a usage error before the command runs", () => {
  const tmp = tempDir();
  cli(["config", "set", "publisher", "rclone"], tmp);
  const run = cli(["--run", "echo hi", "-o", "/tmp/never.png", "--publish", "PR-Shots/"], tmp);
  expect(run.exitCode).toBe(2);
  const record = JSON.parse(run.stdout);
  expect(record.errors[0]).toEqual({ step: "flags", message: expect.stringContaining("remote:path") });
  expect(record.terminal.shell).toBeNull();
});

test("termshot config set with a bad value is a usage error and writes nothing", () => {
  const tmp = tempDir();
  const bad = cli(["config", "set", "font.size", "9"], tmp);
  expect(bad.exitCode).toBe(2);
  expect(JSON.parse(bad.stdout)).toMatchObject({ status: "usage-error", errors: [{ step: "config" }] });
  const unknown = cli(["config", "set", "terminal", "any"], tmp);
  expect(unknown.exitCode).toBe(2);
  expect(JSON.parse(unknown.stdout)).toMatchObject({ status: "usage-error", errors: [{ step: "config", message: expect.stringContaining('unknown config key "terminal"') }] });
  expect(readdirSync(tmp)).toEqual([]);
});

test("a broken config file stops a capture with a usage error that names the file", () => {
  const tmp = tempDir();
  mkdirSync(join(tmp, ".termshot"));
  writeFileSync(join(tmp, ".termshot", "config.json"), JSON.stringify({ font: { colour: 1 } }));
  const run = cli(["--run", "echo hi", "-o", "/tmp/never.png"], tmp);
  expect(run.exitCode).toBe(2);
  const record = JSON.parse(run.stdout);
  expect(record.errors[0].step).toBe("config");
  expect(record.errors[0].message).toContain(join(tmp, ".termshot", "config.json"));
  expect(record.errors[0].message).toContain('unknown config key "font.colour"');
});

test("writeStoredConfig never creates the folder", () => {
  const path = join(tempDir(), ".termshot", "config.json");
  expect(() => writeStoredConfig(path, { theme: "light" })).toThrow();
});
