import { initWasm, Resvg } from "@resvg/resvg-wasm";
import wasmPath from "@resvg/resvg-wasm/index_bg.wasm" with { type: "file" };
import { FONT_FAMILY, loadFontBuffers } from "./fonts.ts";

let ready: Promise<void> | undefined;

function ensureReady(): Promise<void> {
  ready ??= Bun.file(wasmPath)
    .arrayBuffer()
    .then((bytes) => initWasm(bytes));
  return ready;
}

export async function rasterize(svg: string, scale: number): Promise<Uint8Array> {
  await ensureReady();
  const fontBuffers = await loadFontBuffers();
  const resvg = new Resvg(svg, {
    fitTo: { mode: "zoom", value: scale },
    font: { fontBuffers, loadSystemFonts: false, defaultFontFamily: FONT_FAMILY, monospaceFamily: FONT_FAMILY },
  });
  const result = resvg.render().asPng();
  resvg.free();
  return result;
}
