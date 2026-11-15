import { expect, test } from "bun:test";
import { HOLD_WINDOW_OPEN_SECONDS, innerScript, wrappedCommand } from "../src/command-run/inner-script.ts";

test("innerScript records the command's own exit status right after it runs", () => {
  const script = innerScript("starship --version", "/tmp/x.status");
  expect(script).toBe(wrappedCommand(`starship --version; echo $? > "/tmp/x.status"`));
  expect(script).toContain(`starship --version; echo $? > "/tmp/x.status"`);
});

test("innerScript wraps the command exactly once, not twice", () => {
  const script = innerScript("echo hi", "/tmp/x.status");
  const settleOccurrences = script.split("sleep 0.25").length - 1;
  expect(settleOccurrences).toBe(1);
});

// Every one of these guards a shell or terminal artifact that used to land in a
// published capture. See the comment at the top of inner-script.ts.
// The clear must come after a settle, not first: login can still be writing its
// banner when sh starts, and a clear that beats it leaves the banner on screen.
test("wrappedCommand settles before clearing the login banner", () => {
  expect(wrappedCommand("echo hi")).toStartWith("sleep 0.25; printf '\\033[2J\\033[3J\\033[H'; ");
});

test("wrappedCommand holds the window open so no exit banner renders, for a hold derived from the capture budget rather than a flat five minutes", () => {
  expect(wrappedCommand("echo hi")).toMatch(/; sleep \d+$/);
  expect(wrappedCommand("echo hi")).not.toEndWith("; sleep 300");
});

test("wrappedCommand wipes below the output and hides the cursor once the command is done", () => {
  expect(wrappedCommand("echo hi")).toContain("printf '\\033[J\\033[?25l'; sleep");
});

test("the window hold is derived from the capture budget, not the old flat five minutes", () => {
  expect(HOLD_WINDOW_OPEN_SECONDS).toBe(75);
});
