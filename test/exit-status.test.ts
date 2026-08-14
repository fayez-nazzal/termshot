import { expect, test } from "bun:test";
import { parseExitStatus } from "../src/command-run/exit-status.ts";

test("parseExitStatus reads a recorded exit code", () => {
  expect(parseExitStatus("3")).toEqual({ state: "exited", code: 3 });
  expect(parseExitStatus("0")).toEqual({ state: "exited", code: 0 });
});

test("parseExitStatus treats an empty file as still running", () => {
  expect(parseExitStatus("")).toEqual({ state: "running" });
  expect(parseExitStatus("   ")).toEqual({ state: "running" });
});

test("parseExitStatus treats unparseable content as unreadable", () => {
  expect(parseExitStatus("boom")).toEqual({ state: "unreadable" });
});
