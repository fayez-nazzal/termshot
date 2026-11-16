import { afterAll, beforeAll, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pngHeader } from "../src/artifact/png-header.ts";

const ROOT = join(import.meta.dir, "..");

let buildDir = "";
let bin = "";
let tmp = "";
let home = "";

// The compile runs in its own temp folder and writes the binary there,
// because it leaves a large .bun-build file in its working folder, and the
// repo's dist/termshot may be the one on the user's PATH.
beforeAll(() => {
  buildDir = mkdtempSync(join(tmpdir(), "termshot-e2e-build-"));
  bin = join(buildDir, "termshot");
  const build = Bun.spawnSync(["bun", "build", "--compile", join(ROOT, "src", "cli.ts"), "--outfile", bin], { cwd: buildDir, stdout: "pipe", stderr: "pipe" });
  expect(build.exitCode).toBe(0);
  tmp = mkdtempSync(join(tmpdir(), "termshot-e2e-"));
  home = mkdtempSync(join(tmpdir(), "termshot-e2e-home-"));
}, 60000);

afterAll(() => {
  for (const dir of [buildDir, tmp, home]) {
    if (dir !== "") {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

function termshot(args: string[]) {
  const proc = Bun.spawnSync([bin, ...args], { cwd: tmp, env: { ...process.env, HOME: home }, stdout: "pipe", stderr: "pipe" });
  return { exitCode: proc.exitCode, record: JSON.parse(proc.stdout.toString()) };
}

test("compiled binary captures echo hi", () => {
  const { exitCode, record } = termshot(["--run", "echo hi", "-o", join(tmp, "e2e.png")]);
  expect(exitCode).toBe(0);
  expect(record.status).toBe("ok");
  expect(pngHeader(readFileSync(join(tmp, "e2e.png")))).toMatchObject({ width: expect.any(Number) });
}, 30000);

test("outside a project, a capture leaves no .termshot behind", () => {
  const { exitCode, record } = termshot(["--run", "echo hi"]);
  expect(exitCode).toBe(0);
  expect(record.status).toBe("ok");
  expect(existsSync(join(tmp, ".termshot"))).toBe(false);
  expect(record.capture.path.startsWith(join(home, "termshot"))).toBe(true);
  expect(existsSync(record.capture.path)).toBe(true);
}, 30000);

test("a trailing exit no longer times out", () => {
  const { exitCode, record } = termshot(["--run", "exit 3"]);
  expect(exitCode).toBe(1);
  expect(record.status).toBe("command-failed");
  expect(record.command.exitStatus).toBe(3);
  expect(record.command.durationMs).toBeLessThan(5000);
}, 30000);
