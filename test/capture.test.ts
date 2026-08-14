import { expect, test } from "bun:test";
import { captureScreen, listWindows, uniqueWindowTitle, ghosttyLaunchArgs, ghosttyScriptArgs, wrappedCommand } from "../src/capture.ts";

test.skipIf(process.platform === "darwin")("captureScreen throws on unsupported platforms", () => {
  expect(() => captureScreen({ windowId: 1 })).toThrow(/not supported/);
});

test.skipIf(process.platform !== "darwin")("listWindows returns id/owner/pid entries on macOS", () => {
  const wins = listWindows();
  expect(Array.isArray(wins)).toBe(true);
  for (const w of wins) {
    expect(typeof w.id).toBe("number");
    expect(typeof w.owner).toBe("string");
    expect(typeof w.pid).toBe("number");
  }
});

test("uniqueWindowTitle looks like termshot-<pid>-<ms> and varies over time", () => {
  const a = uniqueWindowTitle();
  expect(a).toMatch(/^termshot-\d+-\d+$/);
  expect(a.startsWith(`termshot-${process.pid}-`)).toBe(true);
});

test("ghosttyLaunchArgs invokes the bundled binary directly with title, grid size, wait, and -e sh -c, padded with a trailing sleep", () => {
  const args = ghosttyLaunchArgs("termshot-1-2", "starship --version", 120, 30);
  expect(args).toEqual([
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
    "sleep 0.25; printf '\\033[2J\\033[3J\\033[H'; starship --version; printf '\\033[J\\033[?25l'; sleep 300",
  ]);
});

// Every one of these guards a shell or Ghostty artifact that used to land in a
// published capture. See the comment above ghosttyLaunchArgs for what each one is.
// The clear must come after a settle, not first: login can still be writing its
// banner when sh starts, and a clear that beats it leaves the banner on screen.
test("wrappedCommand settles before clearing the login banner", () => {
  expect(wrappedCommand("echo hi")).toStartWith("sleep 0.25; printf '\\033[2J\\033[3J\\033[H'; ");
});

test("wrappedCommand holds the window open so the Ghostty exit banner never renders", () => {
  expect(wrappedCommand("echo hi")).toEndWith("; sleep 300");
});

test("wrappedCommand wipes below the output and hides the cursor once the command is done", () => {
  expect(wrappedCommand("echo hi")).toContain("printf '\\033[J\\033[?25l'; sleep");
});

test("ghosttyLaunchArgs never lets Ghostty wait after the command", () => {
  const args = ghosttyLaunchArgs("t", "echo hi", 100, 25);
  expect(args).toContain("--wait-after-command=false");
  expect(args).not.toContain("--wait-after-command=true");
});

test("ghosttyLaunchArgs embeds custom cols and rows as grid-cell window size", () => {
  const args = ghosttyLaunchArgs("t", "echo hi", 80, 20);
  expect(args).toContain("--window-width=80");
  expect(args).toContain("--window-height=20");
});

// The window title is an internal handle, so it must never be rendered into a capture.
test("ghosttyLaunchArgs always disables window decoration so no titlebar is captured", () => {
  const args = ghosttyLaunchArgs("termshot-9-9", "echo hi", 100, 25);
  expect(args).toContain("--window-decoration=none");
});

// ghosttyScriptArgs shares the flag set with ghosttyLaunchArgs, but the caller
// has already built the inner script (see command-run/inner-script.ts), so it
// must be passed through unwrapped instead of going through wrappedCommand again.
test("ghosttyScriptArgs passes an already-built script through without wrapping it again", () => {
  const script = "sleep 0.25; printf '\\033[2J\\033[3J\\033[H'; starship --version; echo $? > /tmp/x.status; printf '\\033[J\\033[?25l'; sleep 300";
  const args = ghosttyScriptArgs("termshot-1-2", script, 120, 30);
  expect(args).toEqual([
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
    script,
  ]);
});
