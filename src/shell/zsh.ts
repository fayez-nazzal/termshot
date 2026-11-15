import type { Shell } from "./shell.ts";

export const zsh: Shell = {
  id: "zsh",
  executable: "zsh",
  argv(executablePath, command) {
    return [executablePath, "-c", command];
  },
};
