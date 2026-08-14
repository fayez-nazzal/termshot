import { wrappedCommand } from "../capture.ts";

// Records the command's own exit status to statusPath, right after the command
// finishes and before the tail is tidied, so a poller can read a plain integer
// once it appears. Reusing wrappedCommand keeps the settle/clear/tidy/hold
// ordering it guards completely untouched: the recording command is just the
// "command" wrappedCommand wraps.
export function innerScript(command: string, statusPath: string): string {
  return wrappedCommand(`${command}; echo $? > "${statusPath}"`);
}
