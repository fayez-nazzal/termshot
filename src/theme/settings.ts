import { DEFAULT_THEME_ID, THEME_IDS, parseThemeId, type ThemeId } from "./registry.ts";
import type { Setting } from "../configuration/setting.ts";

export const THEME_SETTINGS: { theme: Setting<ThemeId> } = {
  theme: {
    default: DEFAULT_THEME_ID,
    description: `Color theme of the capture: ${THEME_IDS.join(", ")}`,
    parse: parseThemeId,
  },
};
