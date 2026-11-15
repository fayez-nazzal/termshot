import { imageMarkdown } from "./image-url.ts";
import { commandExists, runCommand } from "./process.ts";
import type { PublishedImage, PublishRequest, Publisher } from "./publisher.ts";

// Posts the PNG as a comment on a pull request with `gh pr comment --attach`,
// which uploads it to GitHub's own attachment storage. No storage repo or
// release is involved. The image URL is read back from the posted comment.

export function commentApiPath(commentUrl: string): string | null {
  const m = /^https:\/\/github\.com\/([^/\s]+)\/([^/\s]+)\/(?:pull|issues)\/\d+#issuecomment-(\d+)$/.exec(commentUrl.trim());
  let result: string | null = null;
  if (m) {
    result = `repos/${m[1]}/${m[2]}/issues/comments/${m[3]}`;
  }
  return result;
}

export function attachmentUrl(commentBody: string): string | null {
  const m = /\((https:\/\/github\.com\/user-attachments\/assets\/[^)\s]+)\)/.exec(commentBody);
  let result: string | null = null;
  if (m) {
    result = m[1]!;
  }
  return result;
}

function requireGh(): void {
  if (!commandExists("gh")) {
    throw new Error("gh not installed. One-time setup: brew install gh, then gh auth login.");
  }
  if (!runCommand(["gh", "auth", "status"]).ok) {
    throw new Error("gh is not logged in. One-time setup: gh auth login.");
  }
}

function postComment(request: PublishRequest): string {
  const posted = runCommand(["gh", "pr", "comment", request.dest, "--attach", `${request.filePath}#${request.label}`]);
  if (!posted.ok) {
    throw new Error(`gh pr comment failed for ${request.dest}: ${posted.stderr.trim()}`);
  }
  return posted.stdout.trim().split("\n").pop() ?? "";
}

function commentBody(commentUrl: string): string {
  const path = commentApiPath(commentUrl);
  if (path == null) {
    throw new Error(`gh pr comment did not print a comment URL, got "${commentUrl}"`);
  }
  const fetched = runCommand(["gh", "api", path, "--jq", ".body"]);
  if (!fetched.ok) {
    throw new Error(`could not read back ${commentUrl}: ${fetched.stderr.trim()}`);
  }
  return fetched.stdout;
}

function publishToPullRequest(request: PublishRequest): PublishedImage {
  requireGh();
  const commentUrl = postComment(request);
  const url = attachmentUrl(commentBody(commentUrl));
  if (url == null) {
    throw new Error(`commented at ${commentUrl}, but found no uploaded image in it`);
  }
  return { url, markdown: imageMarkdown(request.label, url) };
}

function destinationProblem(dest: string): string | null {
  let problem: string | null = null;
  if (!/^\S+$/.test(dest)) {
    problem = `--publish dest for gh must be a pull request number, URL or branch, got "${dest}"`;
  }
  return problem;
}

export const githubPullRequest: Publisher = {
  id: "gh",
  displayName: "GitHub pull request comment (gh)",
  destinationFormat: "a pull request number, URL or branch; posts the image as a PR comment",
  resizesEmbed: false,
  destinationProblem,
  publish: publishToPullRequest,
};
