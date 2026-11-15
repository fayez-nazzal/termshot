export const PROMPT_ROLES = ["directory", "branch", "symbol", "text"] as const;

export type PromptRole = (typeof PROMPT_ROLES)[number];

export interface PromptSegment {
  text: string;
  role: PromptRole;
}

export interface PromptContext {
  cwd: string;
  home: string;
  gitBranch: string | null;
}

export type DirectoryStyle = "full" | "short" | "none";

export interface PromptOptions {
  show: boolean;
  directory: DirectoryStyle;
  git: boolean;
  symbol: string;
}

export interface Prompt {
  segments(context: PromptContext, options: PromptOptions): PromptSegment[];
}
