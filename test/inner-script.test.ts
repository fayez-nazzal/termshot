import { expect, test } from "bun:test";
import { innerScript } from "../src/command-run/inner-script.ts";
import { wrappedCommand } from "../src/capture.ts";

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
