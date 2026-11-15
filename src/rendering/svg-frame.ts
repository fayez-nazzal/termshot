import type { Frame, FrameCell, Paint } from "../frame/frame.ts";
import { paletteColor, rgbHex } from "../theme/palette.ts";
import type { Theme } from "../theme/theme.ts";
import { CELL_WIDTH_EM, LINE_HEIGHT_EM, PADDING, RADIUS } from "./renderer.ts";

interface Style {
  fg: string;
  bg: string | null;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  dim: boolean;
}

// Strip float noise (0.6 * 18 * 120) before rounding up to whole pixels.
function pixels(value: number): number {
  return Math.ceil(Number(value.toFixed(6)));
}

function escapeXml(text: string): string {
  return text.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[ch]!);
}

function resolve(paint: Paint, theme: Theme): string | null {
  let result: string | null;
  if (paint.kind === "default") {
    result = null;
  } else if (paint.kind === "palette") {
    result = paletteColor(theme, paint.index);
  } else if (paint.kind === "rgb") {
    result = rgbHex(paint.rgb);
  } else if (paint.kind === "prompt") {
    result = theme.prompt[paint.role];
  } else {
    result = theme.highlight[paint.role];
  }
  return result;
}

function styleOf(cell: FrameCell, theme: Theme): Style {
  const fg = resolve(cell.fg, theme);
  const bg = resolve(cell.bg, theme);
  const shown = cell.inverse
    ? { fg: bg ?? theme.background, bg: fg ?? theme.foreground }
    : { fg: fg ?? theme.foreground, bg };
  return { ...shown, bold: cell.bold, italic: cell.italic, underline: cell.underline, dim: cell.dim };
}

function sameStyle(a: Style, b: Style): boolean {
  return a.fg === b.fg && a.bold === b.bold && a.italic === b.italic && a.underline === b.underline && a.dim === b.dim;
}

function textAttributes(style: Style): string {
  let result = ` fill="${style.fg}"`;
  result += style.bold ? ` font-weight="bold"` : "";
  result += style.italic ? ` font-style="italic"` : "";
  result += style.underline ? ` text-decoration="underline"` : "";
  result += style.dim ? ` opacity="0.6"` : "";
  return result;
}

export function frameToSvg(frame: Frame, theme: Theme, fontSize: number, fontFamily: string): { svg: string; width: number; height: number } {
  const cellWidth = CELL_WIDTH_EM * fontSize;
  const lineHeight = LINE_HEIGHT_EM * fontSize;
  const width = pixels(2 * PADDING + frame.cols * cellWidth);
  const height = pixels(2 * PADDING + frame.rows.length * lineHeight);
  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<rect width="${width}" height="${height}" rx="${RADIUS}" fill="${theme.background}"/>`,
    `<g font-family="${escapeXml(fontFamily)}" font-size="${fontSize}">`,
  ];
  frame.rows.forEach((row, rowIndex) => {
    const top = PADDING + rowIndex * lineHeight;
    const baseline = top + lineHeight / 2 + fontSize * 0.35;
    const state: { background: { color: string; start: number; end: number } | null; run: { style: Style; start: number; text: string } | null } = {
      background: null,
      run: null,
    };
    const flushBackground = () => {
      const { background } = state;
      if (background) {
        const x = PADDING + background.start * cellWidth;
        parts.push(`<rect x="${x}" y="${top}" width="${(background.end - background.start) * cellWidth}" height="${lineHeight}" fill="${background.color}"/>`);
        state.background = null;
      }
    };
    const flushRun = () => {
      const { run } = state;
      if (run && (run.text.trim() !== "" || run.style.underline)) {
        parts.push(`<text xml:space="preserve" x="${PADDING + run.start * cellWidth}" y="${baseline}"${textAttributes(run.style)}>${escapeXml(run.text)}</text>`);
      }
      state.run = null;
    };
    let col = 0;
    for (const cell of row) {
      if (cell.width !== 0) {
        const style = styleOf(cell, theme);
        if (style.bg !== null && state.background?.color === style.bg && state.background.end === col) {
          state.background.end = col + cell.width;
        } else {
          flushBackground();
          if (style.bg !== null) {
            state.background = { color: style.bg, start: col, end: col + cell.width };
          }
        }
        if (state.run && sameStyle(state.run.style, style)) {
          state.run.text += cell.char;
        } else {
          flushRun();
          state.run = { style, start: col, text: cell.char };
        }
        if (cell.width === 2) {
          flushRun();
        }
      }
      col += 1;
    }
    flushBackground();
    flushRun();
  });
  parts.push("</g>", "</svg>");
  return { svg: parts.join(""), width, height };
}
