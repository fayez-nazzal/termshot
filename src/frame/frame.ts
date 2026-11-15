import type { HighlightRole } from "../highlighting/highlighter.ts";
import type { Token } from "../highlighting/highlighter.ts";
import type { PromptRole, PromptSegment } from "../prompt/prompt.ts";
import type { CellColor, Row } from "../terminal-emulation/terminal-emulator.ts";

export type Paint =
  | CellColor
  | { kind: "prompt"; role: PromptRole }
  | { kind: "highlight"; role: HighlightRole };

export interface FrameCell {
  char: string;
  width: 0 | 1 | 2;
  fg: Paint;
  bg: Paint;
  bold: boolean;
  dim: boolean;
  italic: boolean;
  underline: boolean;
  inverse: boolean;
}

export interface Frame {
  cols: number;
  rows: FrameCell[][];
}

const segmenter = new Intl.Segmenter();

function cell(char: string, width: 0 | 1 | 2, fg: Paint): FrameCell {
  return { char, width, fg, bg: { kind: "default" }, bold: false, dim: false, italic: false, underline: false, inverse: false };
}

function padded(line: FrameCell[], cols: number): FrameCell[] {
  const result = line.slice();
  while (result.length < cols) {
    result.push(cell(" ", 1, { kind: "default" }));
  }
  return result;
}

function headLines(pieces: { text: string; fg: Paint }[], cols: number): FrameCell[][] {
  const lines: FrameCell[][] = [[]];
  for (const piece of pieces) {
    for (const { segment } of segmenter.segment(piece.text)) {
      const width = Math.min(Bun.stringWidth(segment), 2) as 0 | 1 | 2;
      if (width > 0) {
        let line = lines[lines.length - 1]!;
        if (line.length + width > cols) {
          line = [];
          lines[lines.length - 1] = padded(lines[lines.length - 1]!, cols);
          lines.push(line);
        }
        line.push(cell(segment, width, piece.fg));
        if (width === 2) {
          line.push(cell("", 0, piece.fg));
        }
      }
    }
  }
  lines[lines.length - 1] = padded(lines[lines.length - 1]!, cols);
  return lines;
}

export function buildFrame(input: { prompt: PromptSegment[]; command: Token[]; output: Row[]; cols: number; rows: number }): Frame {
  const head = headLines(
    [
      ...input.prompt.map((s) => ({ text: s.text, fg: { kind: "prompt", role: s.role } as Paint })),
      ...input.command.map((t) => ({ text: t.text, fg: { kind: "highlight", role: t.role } as Paint })),
    ],
    input.cols,
  );
  const room = Math.max(0, input.rows - head.length);
  const tail = room === 0 ? [] : input.output.slice(-room);
  return { cols: input.cols, rows: [...head, ...tail] };
}
