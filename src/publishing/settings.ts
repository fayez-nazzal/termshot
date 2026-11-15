import { DEFAULT_PUBLISHER_ID, PUBLISHER_IDS, parsePublisherId, type PublisherId } from "./registry.ts";
import type { Setting } from "../configuration/setting.ts";

export const PUBLISHING_SETTINGS: { publisher: Setting<PublisherId> } = {
  publisher: {
    default: DEFAULT_PUBLISHER_ID,
    description: `Where --publish uploads: ${PUBLISHER_IDS.join(", ")}`,
    parse: parsePublisherId,
  },
};
