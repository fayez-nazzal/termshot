import { RENDER_SCALE, type Renderer } from "./renderer.ts";
import { FONT_FAMILY } from "./fonts.ts";
import { rasterize } from "./resvg.ts";
import { frameToSvg } from "./svg-frame.ts";

const svgRenderer: Renderer = {
  async render(frame, theme, fontSize) {
    const { svg } = frameToSvg(frame, theme, fontSize, FONT_FAMILY);
    return rasterize(svg, RENDER_SCALE);
  },
};

export function defaultRenderer(): Renderer {
  return svgRenderer;
}
