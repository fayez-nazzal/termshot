import type { Theme } from "./theme.ts";

export const light: Theme = {
  id: "light",
  background: "#f7f8fa",
  foreground: "#1f2430",
  ansi: [
    "#1f2430", "#c4314b", "#3d7a1f", "#8a6100", "#2c5fc4", "#8241b8", "#0f7490", "#5f6673",
    "#6b7280", "#a8243b", "#2f6316", "#6e4d00", "#1f4aa0", "#6a2f9c", "#0a5c72", "#3a3f4b",
  ],
  prompt: { directory: "#2c5fc4", branch: "#8241b8", symbol: "#3d7a1f", text: "#1f2430" },
  highlight: {
    command: "#0f7490",
    argument: "#1f2430",
    flag: "#8a6100",
    string: "#3d7a1f",
    variable: "#8241b8",
    operator: "#c4314b",
    comment: "#6b7280",
    path: "#2c5fc4",
    whitespace: "#1f2430",
  },
};
