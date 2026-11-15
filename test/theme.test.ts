import { expect, test } from "bun:test";
import { paletteColor, rgbHex } from "../src/theme/palette.ts";
import { THEME_IDS, parseThemeId, themeFor } from "../src/theme/registry.ts";
import { THEME_SETTINGS } from "../src/theme/settings.ts";

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

test("256-color resolution", () => {
  const t = themeFor("dark");
  expect(paletteColor(t, 1)).toBe("#f7768e");
  expect(paletteColor(t, 196)).toBe("#ff0000");
  expect(paletteColor(t, 232)).toBe("#080808");
  expect(paletteColor(t, 255)).toBe("#eeeeee");
  expect(paletteColor(t, 16)).toBe("#000000");
  expect(paletteColor(t, 231)).toBe("#ffffff");
});

test("rgbHex formats a packed rgb number", () => {
  expect(rgbHex(0x0a0b0c)).toBe("#0a0b0c");
  expect(rgbHex(0xffffff)).toBe("#ffffff");
});

test("every color reaches 3:1 contrast against its background, foreground 7:1", () => {
  for (const id of THEME_IDS) {
    const t = themeFor(id);
    expect(t.ansi).toHaveLength(16);
    expect(contrast(t.foreground, t.background)).toBeGreaterThanOrEqual(7);
    for (const c of [...t.ansi.slice(1), ...Object.values(t.prompt), ...Object.values(t.highlight)]) {
      expect(contrast(c, t.background)).toBeGreaterThanOrEqual(3);
    }
  }
});

test("theme id parsing and setting", () => {
  expect(parseThemeId("light")).toBe("light");
  expect(() => parseThemeId("neon")).toThrow("unknown theme");
  expect(THEME_SETTINGS.theme.default).toBe("dark");
  expect(themeFor("light").id).toBe("light");
});
