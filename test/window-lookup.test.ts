import { expect, test } from "bun:test";
import { AmbiguousWindowError, findWindowIdByPid, resolveWindowIdByPid } from "../src/terminal-session/window-lookup.ts";
import type { WindowInfo } from "../src/terminal-session/window-lookup.ts";

function windowOf(id: number, pid: number, name: string): WindowInfo {
  return { id, owner: "Ghostty", name, layer: 0, pid };
}

test("resolves strictly by pid, never by a title that happens to contain termshot", () => {
  const windows: WindowInfo[] = [windowOf(11, 4242, "termshot-1-2000"), windowOf(22, 5555, "termshot-2-3000")];
  expect(resolveWindowIdByPid(windows, 4242)).toBe(11);
  expect(resolveWindowIdByPid(windows, 5555)).toBe(22);
});

test("a pid owning two windows raises a named error instead of silently taking the first", () => {
  const windows: WindowInfo[] = [windowOf(11, 4242, "termshot-1-2000"), windowOf(12, 4242, "termshot-1-2000 (second window)")];
  expect(() => resolveWindowIdByPid(windows, 4242)).toThrow(AmbiguousWindowError);
  expect(() => resolveWindowIdByPid(windows, 4242)).toThrow(/pid 4242 owns 2 windows/);
});

test("a pid owning no window resolves to undefined rather than throwing", () => {
  const windows: WindowInfo[] = [windowOf(11, 4242, "termshot-1-2000")];
  expect(resolveWindowIdByPid(windows, 9999)).toBeUndefined();
});

test.skipIf(process.platform !== "darwin")("findWindowIdByPid resolves against the real on-screen window list", () => {
  expect(findWindowIdByPid(-1)).toBeUndefined();
});
