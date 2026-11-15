import { githubPullRequest } from "./github-pr.ts";
import { rclone } from "./rclone.ts";
import type { Publisher } from "./publisher.ts";

const PUBLISHERS = {
  rclone,
  gh: githubPullRequest,
} as const satisfies Record<string, Publisher>;

export type PublisherId = keyof typeof PUBLISHERS;

export const PUBLISHER_IDS = Object.keys(PUBLISHERS) as PublisherId[];

export const DEFAULT_PUBLISHER_ID: PublisherId = "rclone";

export function isPublisherId(value: unknown): value is PublisherId {
  return typeof value === "string" && Object.hasOwn(PUBLISHERS, value);
}

export function parsePublisherId(value: unknown): PublisherId {
  if (!isPublisherId(value)) {
    throw new Error(`unknown publisher ${JSON.stringify(value)}; supported publishers: ${PUBLISHER_IDS.join(", ")}`);
  }
  return value;
}

export function publisherFor(id: PublisherId): Publisher {
  return PUBLISHERS[id];
}
