import regularPath from "../../assets/fonts/JetBrainsMono-Regular.ttf" with { type: "file" };
import boldPath from "../../assets/fonts/JetBrainsMono-Bold.ttf" with { type: "file" };
import italicPath from "../../assets/fonts/JetBrainsMono-Italic.ttf" with { type: "file" };
import boldItalicPath from "../../assets/fonts/JetBrainsMono-BoldItalic.ttf" with { type: "file" };

export const FONT_FAMILY = "JetBrains Mono";

let buffers: Promise<Uint8Array[]> | undefined;

export function loadFontBuffers(): Promise<Uint8Array[]> {
  buffers ??= Promise.all([regularPath, boldPath, italicPath, boldItalicPath].map((path) => Bun.file(path).bytes()));
  return buffers;
}
