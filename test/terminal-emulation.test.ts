import { expect, test } from "bun:test";
import { defaultEmulator } from "../src/terminal-emulation/registry.ts";
import type { Row } from "../src/terminal-emulation/terminal-emulator.ts";

const render = (s: string, cols = 20, rows = 5) => defaultEmulator().render(new TextEncoder().encode(s), cols, rows);
const lineText = (row: Row) => row.map((c) => c.char).join("").trimEnd();

test("plain lines, trailing blanks trimmed", async () => {
  const rows = await render("a\r\nb\r\n\r\n");
  expect(rows.map(lineText)).toEqual(["a", "b"]);
  expect(rows[0]!.length).toBe(20);
});
test("palette, rgb and bold attributes survive", async () => {
  const [row] = await render("\x1b[1;31mR\x1b[0m\x1b[38;2;1;2;3mT");
  expect(row![0]).toMatchObject({ char: "R", bold: true, fg: { kind: "palette", index: 1 } });
  expect(row![1]!.fg).toEqual({ kind: "rgb", rgb: 0x010203 });
});
test("wide characters take two cells", async () => {
  const [row] = await render("界x");
  expect(row!.slice(0, 3).map((c) => c.width)).toEqual([2, 0, 1]);
});
test("output taller than rows keeps scrollback", async () => {
  const out = Array.from({ length: 12 }, (_, i) => `l${i}`).join("\r\n");
  expect((await render(out, 20, 5)).map(lineText)).toHaveLength(12);
});
test("carriage-return progress shows only the final state", async () => {
  expect((await render("10%\r50%\r100%")).map(lineText)).toEqual(["100%"]);
});
test("a screen clear leaves only what came after it", async () => {
  expect((await render("old\r\n\x1b[2J\x1b[Hnew")).map(lineText).filter(Boolean)).toEqual(["new"]);
});
