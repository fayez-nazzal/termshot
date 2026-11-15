import { intSetting, type Setting } from "../configuration/setting.ts";

// The kernel accepts up to 65535 for either; 1000 keeps the rendered image a
// sane size while leaving plenty of room.
const MAX_GRID = 1000;

export const COMMAND_RUN_SETTINGS: { cols: Setting<number>; rows: Setting<number> } = {
  cols: {
    default: 120,
    description: "Terminal width in columns",
    parse: intSetting(1, MAX_GRID),
  },
  rows: {
    default: 30,
    description: "Most terminal rows shown; the image is cut to the rows actually used",
    parse: intSetting(1, MAX_GRID),
  },
};
