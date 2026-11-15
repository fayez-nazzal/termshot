import { expect, test } from "bun:test";
import { intSetting, parseBooleanSetting } from "../src/configuration/setting.ts";
import { parseShellId, resolveShellArgv } from "../src/shell/registry.ts";

test("zsh runs the command with -c", () => {
  expect(resolveShellArgv("zsh", "echo hi", () => "/bin/zsh")).toEqual(["/bin/zsh", "-c", "echo hi"]);
});

test("a missing shell names itself and the config key", () => {
  expect(() => resolveShellArgv("bash", "x", () => null)).toThrow(
    "bash was not found on PATH. Install it or pick another shell with `termshot config set shell <name>` (zsh, bash, sh)",
  );
});

test("parseShellId rejects unknown shells", () => {
  expect(() => parseShellId("fish")).toThrow('unknown shell "fish"; supported shells: zsh, bash, sh');
});

test("setting parsers accept CLI strings and JSON values", () => {
  expect(parseBooleanSetting("false")).toBe(false);
  expect(parseBooleanSetting(true)).toBe(true);
  expect(intSetting(10, 48)("18")).toBe(18);
  expect(() => intSetting(10, 48)(9)).toThrow("must be an integer from 10 to 48");
  expect(() => intSetting(10, 48)("1.5")).toThrow("must be an integer from 10 to 48");
});
