import { expect, test } from "bun:test";
import { FONT_FAMILY } from "../src/rendering/fonts.ts";
import { defaultRenderer } from "../src/rendering/registry.ts";
import { rasterize } from "../src/rendering/resvg.ts";
import { RENDERING_SETTINGS } from "../src/rendering/settings.ts";
import { frameToSvg } from "../src/rendering/svg-frame.ts";
import type { Frame, FrameCell } from "../src/frame/frame.ts";
import { themeFor } from "../src/theme/registry.ts";
import { pngHeader } from "../src/screen-capture/png-header.ts";

test("rasterize turns an SVG with text into a 2x PNG", async () => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="40"><text x="4" y="24" font-family="${FONT_FAMILY}" font-size="18">hi</text></svg>`;
  const png = await rasterize(svg, 2);
  expect(pngHeader(png)).toEqual({ width: 200, height: 80 });
});

test("rasterized text actually draws", async () => {
  const bare = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="40"><rect width="100" height="40" fill="#fff"/>`;
  const withText = `${bare}<text x="4" y="24" font-family="${FONT_FAMILY}" font-size="18">hi</text></svg>`;
  const [blank, drawn] = await Promise.all([rasterize(`${bare}</svg>`, 2), rasterize(withText, 2)]);
  expect(Buffer.from(drawn).equals(Buffer.from(blank))).toBe(false);
});

function frameOf(lines: string[], cols: number): Frame {
  const blank = { fg: { kind: "default" }, bg: { kind: "default" }, bold: false, dim: false, italic: false, underline: false, inverse: false } as const;
  return {
    cols,
    rows: lines.map((line) => {
      const cells: FrameCell[] = [];
      for (const { segment } of new Intl.Segmenter().segment(line)) {
        const width = Math.min(Bun.stringWidth(segment), 2) as 1 | 2;
        cells.push({ char: segment, width, ...blank });
        if (width === 2) {
          cells.push({ char: " ", width: 0, ...blank });
        }
      }
      while (cells.length < cols) {
        cells.push({ char: " ", width: 1, ...blank });
      }
      return cells;
    }),
  };
}

test("frame size follows the grid and font size", () => {
  const { width, height } = frameToSvg(frameOf(["hi"], 120), themeFor("dark"), 18, FONT_FAMILY);
  expect([width, height]).toEqual([1360, 91]);
});
test("special characters are escaped", () => {
  const { svg } = frameToSvg(frameOf([`a<b & "c"`], 20), themeFor("dark"), 18, FONT_FAMILY);
  expect(svg).toContain("a&lt;b &amp; &quot;c&quot;");
});
test("renders a real PNG at 2x, including emoji and CJK", async () => {
  const png = await defaultRenderer().render(frameOf(["ok 🚀 界", "<&>"], 40), themeFor("light"), 18);
  expect(pngHeader(png)).toEqual({ width: 2 * (64 + 40 * 10.8), height: 2 * (64 + 2 * 27) });
});
test("font size setting is 10 to 48, default 18", () => {
  const setting = RENDERING_SETTINGS["font.size"];
  expect([setting.default, setting.parse("10"), setting.parse(48)]).toEqual([18, 10, 48]);
  expect(() => setting.parse(9)).toThrow();
  expect(() => setting.parse(49)).toThrow();
});

function styled(patch: Partial<FrameCell>, char = "x"): Frame {
  const frame = frameOf([char], 3);
  frame.rows[0]![0] = { ...frame.rows[0]![0]!, ...patch };
  return frame;
}
const dark = themeFor("dark");
const svgOf = (frame: Frame) => frameToSvg(frame, dark, 18, FONT_FAMILY).svg;

test("inverse swaps default paints to theme colors", () => {
  const svg = svgOf(styled({ inverse: true }));
  expect(svg).toContain(`fill="${dark.foreground}"/>`);
  expect(svg).toContain(`fill="${dark.background}">x</text>`);
});
test("bold, italic, underline and dim become attributes", () => {
  const svg = svgOf(styled({ bold: true, italic: true, underline: true, dim: true }));
  for (const attribute of [`font-weight="bold"`, `font-style="italic"`, `text-decoration="underline"`, `opacity="0.6"`]) {
    expect(svg).toContain(attribute);
  }
});
test("apostrophes are escaped", () => {
  expect(svgOf(styled({}, "'"))).toContain("&apos;");
});
test("a non-default background draws a rect", () => {
  const svg = svgOf(styled({ bg: { kind: "rgb", rgb: 0xff0000 } }));
  expect(svg).toContain(`width="10.8" height="27" fill="#ff0000"`);
});
test("control characters become spaces", () => {
  const svg = svgOf(styled({}, "\x00"));
  expect(svg).not.toContain("\x00");
  expect(svg).not.toContain("\x1b");
  expect(svgOf(styled({ char: "\x1b" }, "a"))).not.toContain("\x1b");
});
