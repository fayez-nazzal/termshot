import type { Highlighter } from "./highlighter.ts";
import { shellTokens } from "./shell-tokens.ts";

export function defaultHighlighter(): Highlighter {
  return shellTokens;
}
