import { expect, test } from "bun:test";
import { alacritty } from "../src/terminal-emulator/alacritty.ts";
import { ghostty } from "../src/terminal-emulator/ghostty.ts";
import { DEFAULT_TERMINAL_ID, TERMINAL_IDS, isTerminalId, parseTerminalId, terminalEmulator } from "../src/terminal-emulator/registry.ts";
import type { LaunchSpec } from "../src/terminal-emulator/terminal-emulator.ts";
import { wrappedCommand } from "../src/command-run/inner-script.ts";

const SPEC: LaunchSpec = { title: "termshot-1-2", script: wrappedCommand("starship --version"), cols: 120, rows: 30 };

test("the registry lists every supported terminal, keyed by its own id", () => {
  expect(TERMINAL_IDS).toEqual(["ghostty", "alacritty"]);
  for (const id of TERMINAL_IDS) {
    expect(terminalEmulator(id).id).toBe(id);
  }
});

test("the default terminal is a registered one", () => {
  expect(isTerminalId(DEFAULT_TERMINAL_ID)).toBe(true);
});

test("parseTerminalId rejects unknown names and lists the supported ones", () => {
  expect(parseTerminalId("alacritty")).toBe("alacritty");
  expect(() => parseTerminalId("kitty")).toThrow(/supported terminals: ghostty, alacritty/);
  expect(() => parseTerminalId("toString")).toThrow(/unknown terminal/);
  expect(() => parseTerminalId(3)).toThrow(/unknown terminal/);
});

// Shared contract every adapter must honour.
for (const id of TERMINAL_IDS) {
  const emulator = terminalEmulator(id);

  test(`${id}: spawns its absolute executable directly, never through \`open\``, () => {
    const argv = emulator.launchArgv(SPEC);
    expect(argv[0]).toBe(emulator.executable);
    expect(emulator.executable.startsWith("/")).toBe(true);
    expect(argv).not.toContain("open");
  });

  test(`${id}: runs the already-built script as the last argument of \`sh -c\`, unwrapped`, () => {
    const argv = emulator.launchArgv(SPEC);
    expect(argv.slice(-3)).toEqual(["sh", "-c", SPEC.script]);
    expect(argv.filter((a) => a === SPEC.script).length).toBe(1);
  });

  test(`${id}: passes the title and the grid size`, () => {
    const argv = emulator.launchArgv({ ...SPEC, cols: 80, rows: 20 }).join("\n");
    expect(argv).toContain("termshot-1-2");
    expect(argv).toContain("80");
    expect(argv).toContain("20");
  });
}

test("ghostty argv is exact", () => {
  expect(ghostty.launchArgv(SPEC)).toEqual([
    "/Applications/Ghostty.app/Contents/MacOS/ghostty",
    "--title=termshot-1-2",
    "--window-decoration=none",
    "--window-width=120",
    "--window-height=30",
    "--window-save-state=never",
    "--wait-after-command=false",
    "-e",
    "sh",
    "-c",
    SPEC.script,
  ]);
});

test("alacritty argv is exact", () => {
  expect(alacritty.launchArgv(SPEC)).toEqual([
    "/Applications/Alacritty.app/Contents/MacOS/alacritty",
    "--title",
    "termshot-1-2",
    "-o",
    "window.dimensions.columns=120",
    "-o",
    "window.dimensions.lines=30",
    "-o",
    'window.startup_mode="Windowed"',
    "-o",
    'window.decorations="None"',
    "-e",
    "sh",
    "-c",
    SPEC.script,
  ]);
});

// The window title is an internal handle, so it must never be rendered into a capture.
test("every adapter disables window decorations so no titlebar is captured", () => {
  expect(ghostty.launchArgv(SPEC)).toContain("--window-decoration=none");
  expect(alacritty.launchArgv(SPEC)).toContain('window.decorations="None"');
});

test("no adapter lets the terminal wait for a keypress after the command", () => {
  expect(ghostty.launchArgv(SPEC)).toContain("--wait-after-command=false");
  expect(alacritty.launchArgv(SPEC)).not.toContain("--hold");
});
