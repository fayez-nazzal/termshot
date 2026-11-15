import { defaultPrompt as promptImplementation } from "./default.ts";
import type { Prompt } from "./prompt.ts";

export function defaultPrompt(): Prompt {
  return promptImplementation;
}
