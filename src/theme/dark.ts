import type { Theme } from "./theme.ts";

export const dark: Theme = {
  id: "dark",
  background: "#16181d",
  foreground: "#d8dee9",
  ansi: [
    "#2a2e38", "#f7768e", "#9ece6a", "#e0af68", "#7aa2f7", "#bb9af7", "#7dcfff", "#c0caf5",
    "#737b8c", "#ff8fa3", "#b5e48c", "#f0c987", "#9bbcff", "#d0b4ff", "#a5e3ff", "#ffffff",
  ],
  prompt: { directory: "#7aa2f7", branch: "#bb9af7", symbol: "#9ece6a", text: "#d8dee9" },
  highlight: {
    command: "#7dcfff",
    argument: "#d8dee9",
    flag: "#e0af68",
    string: "#9ece6a",
    variable: "#bb9af7",
    operator: "#f7768e",
    comment: "#737b8c",
    path: "#c0caf5",
    whitespace: "#d8dee9",
  },
};
