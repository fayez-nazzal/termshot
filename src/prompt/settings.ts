import { enumSetting, parseBooleanSetting, type Setting } from "../configuration/setting.ts";
import type { DirectoryStyle } from "./prompt.ts";

const SYMBOL_MAX_CODE_POINTS = 4;

function parsePromptSymbol(value: unknown): string {
  const rule = `prompt.symbol must be a non-empty string of at most ${SYMBOL_MAX_CODE_POINTS} characters`;
  if (typeof value !== "string" || value === "") {
    throw new Error(`${rule}, got ${JSON.stringify(value)}`);
  }
  if ([...value].length > SYMBOL_MAX_CODE_POINTS) {
    throw new Error(`${rule}, got ${JSON.stringify(value)}`);
  }
  return value;
}

export const PROMPT_SETTINGS: {
  "prompt.show": Setting<boolean>;
  "prompt.directory": Setting<DirectoryStyle>;
  "prompt.git": Setting<boolean>;
  "prompt.symbol": Setting<string>;
} = {
  "prompt.show": {
    default: true,
    description: "Draw the prompt line above the command: true or false",
    parse: parseBooleanSetting,
  },
  "prompt.directory": {
    default: "full",
    description: "How the prompt shows the directory: full, short, none",
    parse: enumSetting(["full", "short", "none"] as const, "directory style"),
  },
  "prompt.git": {
    default: true,
    description: "Show the git branch in the prompt: true or false",
    parse: parseBooleanSetting,
  },
  "prompt.symbol": {
    default: "❯",
    description: `Prompt symbol, 1 to ${SYMBOL_MAX_CODE_POINTS} characters`,
    parse: parsePromptSymbol,
  },
};
