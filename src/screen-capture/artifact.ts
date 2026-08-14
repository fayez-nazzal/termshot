import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export interface ArtifactRecord {
  path: string;
  bytes: number;
  sha256: string;
}

export function writeArtifact(path: string, data: Uint8Array): ArtifactRecord {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, data);
  const sha256 = createHash("sha256").update(data).digest("hex");
  return { path, bytes: data.length, sha256 };
}
