import { dark } from "./dark.ts";
import { light } from "./light.ts";
import type { Theme } from "./theme.ts";
import { enumSetting } from "../configuration/setting.ts";

const THEMES = {
  dark,
  light,
} as const satisfies Record<string, Theme>;

export type ThemeId = keyof typeof THEMES;

export const THEME_IDS = Object.keys(THEMES) as ThemeId[];

export const DEFAULT_THEME_ID: ThemeId = "dark";

export const parseThemeId: (value: unknown) => ThemeId = enumSetting(THEME_IDS, "theme");

export function themeFor(id: ThemeId): Theme {
  return THEMES[id];
}
