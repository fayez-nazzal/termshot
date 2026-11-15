import type { LaunchSpec, TerminalEmulator } from "./terminal-emulator.ts";

// Launching through `open -na Ghostty.app --args ...` routes the command
// through macOS Apple Events, and in practice that layer silently drops
// -e and --command: the window opens but falls back to the default login
// shell instead of running what we asked for. Invoking the bundled binary
// directly does not go through that layer and reliably runs the command.
//
// --window-width/--window-height are terminal grid cells, not pixels, and on
// macOS they lose to state restoration: Ghostty reopens at the last saved
// window frame and silently ignores the requested grid size. Disabling
// window-save-state for the spawned process is what makes the size stick.
//
// --wait-after-command=false keeps Ghostty's `Process exited. Press any key to
// close the terminal.` banner from ever being drawn.
//
// --window-decoration=none drops the macOS titlebar. Never re-enable it.
const EXECUTABLE = "/Applications/Ghostty.app/Contents/MacOS/ghostty";

export const ghostty: TerminalEmulator = {
  id: "ghostty",
  displayName: "Ghostty",
  executable: EXECUTABLE,
  launchArgv(spec: LaunchSpec): string[] {
    return [
      EXECUTABLE,
      `--title=${spec.title}`,
      "--window-decoration=none",
      `--window-width=${spec.cols}`,
      `--window-height=${spec.rows}`,
      "--window-save-state=never",
      "--wait-after-command=false",
      "-e",
      "sh",
      "-c",
      spec.script,
    ];
  },
};
