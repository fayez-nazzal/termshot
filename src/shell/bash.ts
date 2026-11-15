import type { Shell } from "./shell.ts";

export const bash: Shell = {
  id: "bash",
  executable: "bash",
  argv(executablePath, command) {
    return [executablePath, "-c", command];
  },
};
