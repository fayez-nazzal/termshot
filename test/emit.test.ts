import { expect, test } from "bun:test";
import { buildResult } from "../src/run-result/build.ts";
import { emit } from "../src/run-result/emit.ts";

test("emit writes exactly one JSON line to stdout that parses back to the result", () => {
  const result = buildResult({ tool: "termshot", version: "0.5.0", status: "ok", capture: { path: "/tmp/x.png", bytes: 10 } });
  const stdoutChunks: string[] = [];
  const originalWrite = process.stdout.write.bind(process.stdout);
  process.stdout.write = ((chunk: string) => {
    stdoutChunks.push(chunk);
    return true;
  }) as typeof process.stdout.write;
  try {
    emit(result);
  } finally {
    process.stdout.write = originalWrite;
  }
  const stdoutText = stdoutChunks.join("");
  const lines = stdoutText.split("\n").filter((l) => l.length > 0);
  expect(lines.length).toBe(1);
  expect(JSON.parse(lines[0]!)).toEqual(result);
});
