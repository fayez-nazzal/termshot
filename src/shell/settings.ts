import { DEFAULT_SHELL_ID, SHELL_IDS, parseShellId, type ShellId } from "./registry.ts";
import type { Setting } from "../configuration/setting.ts";

export const SHELL_SETTINGS: { shell: Setting<ShellId> } = {
  shell: {
    default: DEFAULT_SHELL_ID,
    description: `Shell the command runs in: ${SHELL_IDS.join(", ")}`,
    parse: parseShellId,
  },
};
