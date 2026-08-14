import { expect, test } from "bun:test";
import { decideCompletion } from "../src/command-run/completion.ts";

test("an exited outcome always means capture, even at the timeout edge", () => {
  expect(decideCompletion({ state: "exited", code: 0 }, 999999, 1000)).toBe("capture");
});

test("a running outcome under the timeout means wait", () => {
  expect(decideCompletion({ state: "running" }, 500, 1000)).toBe("wait");
});

test("a running outcome past the timeout means timeout", () => {
  expect(decideCompletion({ state: "running" }, 1000, 1000)).toBe("timeout");
});

test("an unreadable outcome under the timeout still means wait, so a half-written status file gets retried", () => {
  expect(decideCompletion({ state: "unreadable" }, 0, 1000)).toBe("wait");
});
