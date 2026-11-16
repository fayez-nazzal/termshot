import { beforeAll, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pngHeader } from "../src/artifact/png-header.ts";

const ROOT = join(import.meta.dir, "..");
const BIN = join(ROOT, "dist", "termshot");

let tmp = "";
let home = "";

beforeAll(() => {
  const build = Bun.spawnSync(["bun", "run", "build"], { cwd: ROOT, stdout: "pipe", stderr: "pipe" });
  expect(build.exitCode).toBe(0);
  tmp = mkdtempSync(join(tmpdir(), "termshot-e2e-"));
  home = mkdtempSync(join(tmpdir(), "termshot-e2e-home-"));
}, 60000);

function termshot(args: string[]) {
  const proc = Bun.spawnSync([BIN, ...args], { cwd: tmp, env: { ...process.env, HOME: home }, stdout: "pipe", stderr: "pipe" });
  return JSON.parse(proc.stdout.toString());
}

test("compiled binary captures echo hi", () => {
  const record = termshot(["--run", "echo hi", "-o", join(tmp, "e2e.png")]);
  expect(record.status).toBe("ok");
  expect(pngHeader(readFileSync(join(tmp, "e2e.png")))).toMatchObject({ width: expect.any(Number) });
}, 30000);

test("outside a project, a capture leaves no .termshot behind", () => {
  const record = termshot(["--run", "echo hi"]);
  expect(record.status).toBe("ok");
  expect(existsSync(join(tmp, ".termshot"))).toBe(false);
  expect(record.capture.path.startsWith(join(home, "termshot"))).toBe(true);
  expect(existsSync(record.capture.path)).toBe(true);
}, 30000);

test("a trailing exit no longer times out", () => {
  const record = termshot(["--run", "exit 3"]);
  expect(record.status).toBe("command-failed");
  expect(record.command.exitStatus).toBe(3);
  expect(record.command.durationMs).toBeLessThan(5000);
}, 30000);
