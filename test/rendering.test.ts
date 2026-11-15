import { expect, test } from "bun:test";
import { FONT_FAMILY } from "../src/rendering/fonts.ts";
import { rasterize } from "../src/rendering/resvg.ts";
import { pngHeader } from "../src/screen-capture/png-header.ts";

test("rasterize turns an SVG with text into a 2x PNG", async () => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="40"><text x="4" y="24" font-family="${FONT_FAMILY}" font-size="18">hi</text></svg>`;
  const png = await rasterize(svg, 2);
  expect(pngHeader(png)).toEqual({ width: 200, height: 80 });
});
