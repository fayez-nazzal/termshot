import { imageMarkdown, servesPublicImage } from "./image-url.ts";
import { commandExists, runCommand } from "./process.ts";
import type { PublishedImage, PublishRequest, Publisher } from "./publisher.ts";

// Uploads to a Google Drive rclone remote and embeds the file through Drive.
// Operates on the file path and URLs only: rclone moves the file by path,
// curl checks a URL header. Kept in step with browsershot's copy of this
// adapter; the tests beside it pin the observable behaviour.

export function remoteName(dest: string): string {
  const idx = dest.indexOf(":");
  let result = "";
  if (idx > 0) {
    result = dest.slice(0, idx);
  }
  return result;
}

export function normalizeDest(dest: string): string {
  let result = dest;
  if (!dest.endsWith("/")) {
    result = `${dest}/`;
  }
  return result;
}

export function basename(filePath: string): string {
  const parts = filePath.split("/");
  let result = filePath;
  if (parts.length > 0) {
    result = parts[parts.length - 1]!;
  }
  return result;
}

export function extractDriveFileId(link: string): string | null {
  let result: string | null = null;
  const m = /(?:\/d\/|[?&]id=)([A-Za-z0-9_-]+)/.exec(link);
  if (m) {
    result = m[1]!;
  }
  return result;
}

// The lh3.googleusercontent.com/d/<id> host serves the image directly (no
// cross-domain redirect), so GitHub camo and Azure DevOps render it reliably
// where the drive.google.com/thumbnail redirect gets dropped. =w<px> caps the
// long edge at high resolution; =s0 would serve the untouched original.
export function embedUrl(fileId: string, size: number): string {
  return `https://lh3.googleusercontent.com/d/${fileId}=w${size}`;
}

export function rcloneRemoteConfigured(remote: string, listRemotesOutput: string): boolean {
  const target = `${remote}:`;
  const lines = listRemotesOutput.split("\n");
  let result = false;
  for (const line of lines) {
    if (line.trim() === target) {
      result = true;
    }
  }
  return result;
}

function requireRclone(remote: string): void {
  if (!commandExists("rclone")) {
    throw new Error(`rclone not installed. One-time setup: brew install rclone, then rclone config to create a Google Drive remote named "${remote}".`);
  }
  const listed = runCommand(["rclone", "listremotes"]);
  if (!rcloneRemoteConfigured(remote, listed.stdout)) {
    throw new Error(`rclone remote "${remote}:" not configured. One-time setup: rclone config to create a Google Drive remote named "${remote}".`);
  }
}

function driveShareUrl(remotePath: string): string {
  const linked = runCommand(["rclone", "link", remotePath]);
  if (!linked.ok) {
    const detail = linked.stderr.trim() || `exit ${linked.stdout.trim()}`;
    throw new Error(`rclone link failed: ${detail}`);
  }
  return linked.stdout.trim();
}

function publishToDrive(request: PublishRequest): PublishedImage {
  requireRclone(remoteName(request.dest));
  const dest = normalizeDest(request.dest);
  const copied = runCommand(["rclone", "copy", request.filePath, dest]);
  if (!copied.ok) {
    const detail = copied.stderr.trim() || `exit`;
    throw new Error(`rclone copy failed: ${detail}`);
  }

  const remotePath = `${dest}${basename(request.filePath)}`;
  let attempt = 0;
  let verified = false;
  let url = "";
  let fileId = extractDriveFileId(driveShareUrl(remotePath));
  while (attempt < 2 && !verified) {
    if (attempt > 0) {
      fileId = extractDriveFileId(driveShareUrl(remotePath));
    }
    if (fileId === null) {
      throw new Error(`could not extract a Drive file id from the share url`);
    }
    url = embedUrl(fileId, request.size);
    verified = servesPublicImage(url);
    attempt = attempt + 1;
  }
  if (!verified) {
    throw new Error(`embed url did not verify as a 200 image for ${url}`);
  }
  return { url, markdown: imageMarkdown(request.label, url) };
}

function destinationProblem(dest: string): string | null {
  let problem: string | null = null;
  if (remoteName(dest) === "") {
    problem = `--publish dest for rclone must look like remote:path, got "${dest}"`;
  }
  return problem;
}

export const rclone: Publisher = {
  id: "rclone",
  displayName: "rclone (Google Drive)",
  destinationFormat: "remote:path, a Google Drive rclone remote (e.g. gdrive:PR-Shots/)",
  resizesEmbed: true,
  destinationProblem,
  publish: publishToDrive,
};
