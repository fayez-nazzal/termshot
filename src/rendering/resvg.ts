import { initWasm, Resvg } from "@resvg/resvg-wasm";
import wasmPath from "@resvg/resvg-wasm/index_bg.wasm" with { type: "file" };
import { FONT_FAMILY, loadFontBuffers } from "./fonts.ts";

// 2^28 pixels (1 GiB of RGBA). The rasterizer runs in 32-bit wasm memory and
// panics somewhere between 400 and 576 million pixels; this stays well under
// that. It still fits any one of cols, rows or font.size at its maximum with
// the rest at their defaults (at most 120 x 1000 at 18: 147.2 million), and
// even 1000 cols x 30 rows at font.size 48 (256.8 million).
const MAX_PIXELS = 2 ** 28;

let ready: Promise<void> | undefined;

function ensureReady(): Promise<void> {
  ready ??= Bun.file(wasmPath)
    .arrayBuffer()
    .then((bytes) => initWasm(bytes));
  return ready;
}

// After a panic inside render(), free() throws an aliasing error of its own.
// Swallowing it lets the panic, the real cause, reach the caller.
export function freeQuietly(resource: { free(): void }): void {
  try {
    resource.free();
  } catch {
    /* already broken by the error being thrown */
  }
}

export async function rasterize(svg: string, scale: number): Promise<Uint8Array> {
  await ensureReady();
  const fontBuffers = await loadFontBuffers();
  const resvg = new Resvg(svg, {
    fitTo: { mode: "zoom", value: scale },
    font: { fontBuffers, loadSystemFonts: false, defaultFontFamily: FONT_FAMILY, monospaceFamily: FONT_FAMILY },
  });
  const width = Math.ceil(resvg.width * scale);
  const height = Math.ceil(resvg.height * scale);
  let result: Uint8Array;
  try {
    if (width * height > MAX_PIXELS) {
      throw new Error(`image too large: ${width}x${height} px; lower rows or font.size`);
    }
    const image = resvg.render();
    try {
      result = image.asPng();
    } finally {
      freeQuietly(image);
    }
  } finally {
    freeQuietly(resvg);
  }
  return result;
}
