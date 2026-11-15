import type { Frame } from "../frame/frame.ts";
import type { Theme } from "../theme/theme.ts";

export const RENDER_SCALE = 2;
export const PADDING = 32;
export const RADIUS = 14;
export const CELL_WIDTH_EM = 0.6;
export const LINE_HEIGHT_EM = 1.5;

// Draws a frame to PNG bytes at RENDER_SCALE times its logical size.
export interface Renderer {
  render(frame: Frame, theme: Theme, fontSize: number): Promise<Uint8Array>;
}
