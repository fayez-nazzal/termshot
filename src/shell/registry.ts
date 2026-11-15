import { bash } from "./bash.ts";
import { sh } from "./sh.ts";
import { ShellNotFoundError, type Shell } from "./shell.ts";
import { zsh } from "./zsh.ts";
import { enumSetting } from "../configuration/setting.ts";

const SHELLS = {
  zsh,
  bash,
  sh,
} as const satisfies Record<string, Shell>;

export type ShellId = keyof typeof SHELLS;

export const SHELL_IDS = Object.keys(SHELLS) as ShellId[];

export const DEFAULT_SHELL_ID: ShellId = "zsh";

export const parseShellId: (value: unknown) => ShellId = enumSetting(SHELL_IDS, "shell");

export function shellFor(id: ShellId): Shell {
  return SHELLS[id];
}

export function resolveShellArgv(id: ShellId, command: string, which: (name: string) => string | null): string[] {
  const shell = shellFor(id);
  const executablePath = which(shell.executable);
  if (executablePath === null) {
    throw new ShellNotFoundError(
      `${id} was not found on PATH. Install it or pick another shell with \`termshot config set shell <name>\` (${SHELL_IDS.join(", ")})`,
    );
  }
  return shell.argv(executablePath, command);
}
