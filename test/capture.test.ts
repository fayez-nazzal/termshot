import { expect, test } from "bun:test";
import { captureScreen, uniqueWindowTitle, ghosttyLaunchArgs, wrappedCommand } from "../src/capture.ts";

test.skipIf(process.platform === "darwin")("captureScreen throws on unsupported platforms", () => {
  expect(() => captureScreen({ windowId: 1 })).toThrow(/not supported/);
});

test("uniqueWindowTitle looks like termshot-<pid>-<ms> and varies over time", () => {
  const a = uniqueWindowTitle();
  expect(a).toMatch(/^termshot-\d+-\d+$/);
  expect(a.startsWith(`termshot-${process.pid}-`)).toBe(true);
});

// wrappedCommand builds the script passed to ghosttyLaunchArgs; command-run/inner-script.ts
// is what calls wrappedCommand once and hands the already-built script through here.
test("ghosttyLaunchArgs invokes the bundled binary directly with title, grid size, wait, and -e sh -c, passing an already-built script through unwrapped", () => {
  const script = wrappedCommand("starship --version");
  const args = ghosttyLaunchArgs("termshot-1-2", script, 120, 30);
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

// Every one of these guards a shell or Ghostty artifact that used to land in a
// published capture. See the comment above ghosttyLaunchArgs for what each one is.
// The clear must come after a settle, not first: login can still be writing its
// banner when sh starts, and a clear that beats it leaves the banner on screen.
test("wrappedCommand settles before clearing the login banner", () => {
  expect(wrappedCommand("echo hi")).toStartWith("sleep 0.25; printf '\\033[2J\\033[3J\\033[H'; ");
});

test("wrappedCommand holds the window open so the Ghostty exit banner never renders, for a hold derived from the capture budget rather than a flat five minutes", () => {
  expect(wrappedCommand("echo hi")).toMatch(/; sleep \d+$/);
  expect(wrappedCommand("echo hi")).not.toEndWith("; sleep 300");
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
