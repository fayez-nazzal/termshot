export const HIGHLIGHT_ROLES = [
  "command",
  "argument",
  "flag",
  "string",
  "variable",
  "operator",
  "comment",
  "path",
  "whitespace",
] as const;

export type HighlightRole = (typeof HIGHLIGHT_ROLES)[number];

export interface Token {
  text: string;
  role: HighlightRole;
}

export interface Highlighter {
  tokenize(command: string): Token[];
}
