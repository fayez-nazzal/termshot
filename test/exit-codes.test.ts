import { expect, test } from "bun:test";
import { buildResult } from "../src/run-result/build.ts";
import { exitCodeFor } from "../src/run-result/exit-codes.ts";
import type { RunStatus } from "../src/run-result/result.ts";

const EXPECTED: Record<RunStatus, number> = {
  ok: 0,
  "command-failed": 1,
  "usage-error": 2,
  "environment-error": 3,
  timeout: 4,
  truncated: 5,
  "publish-failed": 6,
  "internal-error": 7,
};

for (const [status, code] of Object.entries(EXPECTED)) {
  test(`status "${status}" maps to exit code ${code}`, () => {
    const result = buildResult({ tool: "termshot", version: "0.5.0", status: status as RunStatus });
    expect(exitCodeFor(result)).toBe(code);
    expect(result.exitCode).toBe(code);
  });
}

test("no undocumented status is reachable", () => {
  expect(Object.keys(EXPECTED).length).toBe(8);
  expect(() => exitCodeFor({ ...buildResult({ tool: "termshot", version: "0.5.0", status: "ok" }), status: "made-up" as RunStatus })).toThrow(/no exit code documented/);
});
