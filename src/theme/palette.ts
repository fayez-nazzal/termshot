import type { Theme } from "./theme.ts";

const CUBE_LEVELS = [0, 95, 135, 175, 215, 255] as const;

function hexByte(value: number): string {
  return value.toString(16).padStart(2, "0");
}

export function rgbHex(rgb: number): string {
  return `#${hexByte((rgb >> 16) & 0xff)}${hexByte((rgb >> 8) & 0xff)}${hexByte(rgb & 0xff)}`;
}

export function paletteColor(theme: Theme, index: number): string {
  let result: string;
  if (index < 16) {
    result = theme.ansi[index]!;
  } else if (index < 232) {
    const cube = index - 16;
    const [r, g, b] = [Math.floor(cube / 36), Math.floor(cube / 6) % 6, cube % 6];
    result = `#${hexByte(CUBE_LEVELS[r!]!)}${hexByte(CUBE_LEVELS[g!]!)}${hexByte(CUBE_LEVELS[b!]!)}`;
  } else {
    const grey = hexByte(8 + 10 * (index - 232));
    result = `#${grey}${grey}${grey}`;
  }
  return result;
}
