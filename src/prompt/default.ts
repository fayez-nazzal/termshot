import type { DirectoryStyle, Prompt, PromptContext, PromptSegment } from "./prompt.ts";

function tildePath(cwd: string, home: string): string {
  let result = cwd;
  if (home !== "" && home !== "/") {
    if (cwd === home) {
      result = "~";
    } else if (cwd.startsWith(`${home}/`)) {
      result = `~${cwd.slice(home.length)}`;
    }
  }
  return result;
}

function directoryText(context: PromptContext, style: DirectoryStyle): string | null {
  let result: string | null = null;
  if (style === "full") {
    result = tildePath(context.cwd, context.home);
  } else if (style === "short") {
    const full = tildePath(context.cwd, context.home);
    const name = full.split("/").filter((part) => part !== "").pop();
    result = full === "~" || name === undefined ? full : name;
  }
  return result;
}

export const defaultPrompt: Prompt = {
  segments(context, options) {
    const result: PromptSegment[] = [];
    if (options.show) {
      const directory = directoryText(context, options.directory);
      const branch = options.git ? context.gitBranch : null;
      if (directory !== null) {
        result.push({ text: directory, role: "directory" });
      }
      if (branch !== null) {
        if (directory !== null) {
          result.push({ text: " on ", role: "text" });
        }
        result.push({ text: branch, role: "branch" });
      }
      if (directory !== null || branch !== null) {
        result.push({ text: " ", role: "text" });
      }
      result.push({ text: options.symbol, role: "symbol" }, { text: " ", role: "text" });
    }
    return result;
  },
};
