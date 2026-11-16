import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, extname } from "node:path";

export interface ArtifactRecord {
  path: string;
  bytes: number;
  sha256: string;
}

function recordOf(path: string, data: Uint8Array): ArtifactRecord {
  const sha256 = createHash("sha256").update(data).digest("hex");
  return { path, bytes: data.length, sha256 };
}

// Replaces any file already at path.
export function writeArtifact(path: string, data: Uint8Array): ArtifactRecord {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, data);
  return recordOf(path, data);
}

// Never replaces a file. When path is taken it tries <name>-1.png,
// <name>-2.png and so on, and the record names the file actually written.
export function writeNewArtifact(path: string, data: Uint8Array): ArtifactRecord {
  mkdirSync(dirname(path), { recursive: true });
  const extension = extname(path);
  const stem = path.slice(0, path.length - extension.length);
  let written: string | null = null;
  for (let suffix = 0; written == null; suffix++) {
    const candidate = suffix === 0 ? path : `${stem}-${suffix}${extension}`;
    try {
      writeFileSync(candidate, data, { flag: "wx" });
      written = candidate;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") {
        throw e;
      }
    }
  }
  return recordOf(written, data);
}
