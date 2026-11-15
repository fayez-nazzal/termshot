import type { Shell } from "./shell.ts";

export const sh: Shell = {
  id: "sh",
  executable: "sh",
  argv(executablePath, command) {
    return [executablePath, "-c", command];
  },
};
