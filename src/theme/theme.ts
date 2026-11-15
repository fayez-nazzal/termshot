import type { HighlightRole } from "../highlighting/highlighter.ts";
import type { PromptRole } from "../prompt/prompt.ts";

export interface Theme {
  readonly id: string;
  readonly background: string;
  readonly foreground: string;
  readonly ansi: readonly string[];
  readonly prompt: Record<PromptRole, string>;
  readonly highlight: Record<HighlightRole, string>;
}
