import { intSetting, type Setting } from "../configuration/setting.ts";

export const RENDERING_SETTINGS: { "font.size": Setting<number> } = {
  "font.size": {
    default: 18,
    description: "Font size in pixels, before the 2x render scale, 10 to 48",
    parse: intSetting(10, 48),
  },
};
