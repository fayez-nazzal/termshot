import regularPath from "../../assets/fonts/JetBrainsMono-Regular.ttf" with { type: "file" };
import boldPath from "../../assets/fonts/JetBrainsMono-Bold.ttf" with { type: "file" };
import italicPath from "../../assets/fonts/JetBrainsMono-Italic.ttf" with { type: "file" };
import boldItalicPath from "../../assets/fonts/JetBrainsMono-BoldItalic.ttf" with { type: "file" };

export const FONT_FAMILY = "JetBrains Mono";

export function loadFontBuffers(): Promise<Uint8Array[]> {
  return Promise.all([regularPath, boldPath, italicPath, boldItalicPath].map((path) => Bun.file(path).bytes()));
}
