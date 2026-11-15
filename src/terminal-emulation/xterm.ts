import { Terminal } from "@xterm/headless";
import type { IBufferCell } from "@xterm/headless";
import type { Cell, CellColor, Row, TerminalEmulator } from "./terminal-emulator.ts";

const SCROLLBACK_LINES = 10000;

function colorOf(isPalette: boolean, isRgb: boolean, value: number): CellColor {
  let result: CellColor = { kind: "default" };
  if (isPalette) result = { kind: "palette", index: value };
  else if (isRgb) result = { kind: "rgb", rgb: value };
  return result;
}

function cellOf(cell: IBufferCell): Cell {
  return {
    char: cell.getChars() || " ",
    width: cell.getWidth() as 0 | 1 | 2,
    fg: colorOf(cell.isFgPalette(), cell.isFgRGB(), cell.getFgColor()),
    bg: colorOf(cell.isBgPalette(), cell.isBgRGB(), cell.getBgColor()),
    bold: cell.isBold() !== 0,
    dim: cell.isDim() !== 0,
    italic: cell.isItalic() !== 0,
    underline: cell.isUnderline() !== 0,
    inverse: cell.isInverse() !== 0,
  };
}

function isBlank(row: Row): boolean {
  return row.every(
    (cell) => cell.char === " " && cell.bg.kind === "default" && !cell.inverse && !cell.underline,
  );
}

export const xtermEmulator: TerminalEmulator = {
  async render(bytes, cols, rows) {
    const term = new Terminal({ cols, rows, scrollback: SCROLLBACK_LINES, allowProposedApi: true });
    const lines: Row[] = [];
    try {
      // Lines above the last full-screen clear are not part of the final state.
      let firstLine = 0;
      term.parser.registerCsiHandler({ final: "J" }, (params) => {
        if (params[0] === 2) firstLine = term.buffer.active.baseY;
        else if (params[0] === 3) firstLine = 0;
        return false;
      });
      await new Promise<void>((resolve) => term.write(bytes, resolve));
      const buffer = term.buffer.active;
      for (let y = firstLine; y < buffer.length; y++) {
        const line = buffer.getLine(y);
        const row: Row = [];
        for (let x = 0; x < cols; x++) {
          row.push(cellOf(line?.getCell(x) ?? buffer.getNullCell()));
        }
        lines.push(row);
      }
    } finally {
      term.dispose();
    }
    while (lines.length > 0 && isBlank(lines[lines.length - 1]!)) lines.pop();
    return lines;
  },
};
