import type { LaunchSpec, TerminalEmulator } from "./terminal-emulator.ts";

// Settings are passed as `-o key=value` overrides (TOML values, Alacritty
// 0.13+), layered on top of the user's own config so fonts and colours still
// match their terminal.
//
// window.dimensions are terminal grid cells. They only apply to a windowed
// start, so startup_mode is pinned to Windowed in case the user's config
// maximizes or fullscreens new windows.
//
// window.decorations="None" drops the macOS titlebar. Never re-enable it.
//
// Alacritty closes the window as soon as the command exits unless --hold is
// passed, so it never shows an exit banner. --hold is deliberately absent.
//
// An explicit `-e` also bypasses any single-instance shell wrapper in the
// user's config: it always opens a new, independent window owned by this pid.
const EXECUTABLE = "/Applications/Alacritty.app/Contents/MacOS/alacritty";

export const alacritty: TerminalEmulator = {
  id: "alacritty",
  displayName: "Alacritty",
  executable: EXECUTABLE,
  launchArgv(spec: LaunchSpec): string[] {
    return [
      EXECUTABLE,
      "--title",
      spec.title,
      "-o",
      `window.dimensions.columns=${spec.cols}`,
      "-o",
      `window.dimensions.lines=${spec.rows}`,
      "-o",
      'window.startup_mode="Windowed"',
      "-o",
      'window.decorations="None"',
      "-e",
      "sh",
      "-c",
      spec.script,
    ];
  },
};
