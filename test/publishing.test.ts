import { expect, test } from "bun:test";
import { attachmentUrl, commentApiPath } from "../src/publishing/github-pr.ts";
import { imageHeadersOk, imageMarkdown } from "../src/publishing/image-url.ts";
import { DEFAULT_EMBED_WIDTH } from "../src/publishing/publisher.ts";
import { basename, embedUrl, extractDriveFileId, normalizeDest, rcloneRemoteConfigured, remoteName } from "../src/publishing/rclone.ts";
import { DEFAULT_PUBLISHER_ID, PUBLISHER_IDS, isPublisherId, parsePublisherId, publisherFor } from "../src/publishing/registry.ts";

test("the registry lists every supported publisher, keyed by its own id", () => {
  expect(PUBLISHER_IDS).toEqual(["rclone", "gh"]);
  for (const id of PUBLISHER_IDS) {
    expect(publisherFor(id).id).toBe(id);
  }
  expect(isPublisherId(DEFAULT_PUBLISHER_ID)).toBe(true);
});

test("parsePublisherId rejects unknown names and lists the supported ones", () => {
  expect(parsePublisherId("gh")).toBe("gh");
  expect(() => parsePublisherId("s3")).toThrow(/supported publishers: rclone, gh/);
  expect(() => parsePublisherId("toString")).toThrow(/unknown publisher/);
});

test("each publisher accepts its own destination format and names the format when rejecting", () => {
  expect(publisherFor("rclone").destinationProblem("gdrive:PR-Shots/")).toBeNull();
  expect(publisherFor("rclone").destinationProblem("PR-Shots/")).toContain("remote:path");
  expect(publisherFor("gh").destinationProblem("42")).toBeNull();
  expect(publisherFor("gh").destinationProblem("https://github.com/octo/app/pull/42")).toBeNull();
  expect(publisherFor("gh").destinationProblem("feature/login")).toBeNull();
  expect(publisherFor("gh").destinationProblem("")).toContain("pull request number, URL or branch");
  expect(publisherFor("gh").destinationProblem("two words")).toContain("pull request number, URL or branch");
});

test("only rclone resizes the embed", () => {
  expect(publisherFor("rclone").resizesEmbed).toBe(true);
  expect(publisherFor("gh").resizesEmbed).toBe(false);
});

test("imageMarkdown emits a single image line", () => {
  expect(imageMarkdown("home", "https://example.com/a.png")).toBe("![home](https://example.com/a.png)");
});

test("imageHeadersOk requires the final hop to be a 200 image", () => {
  expect(imageHeadersOk("HTTP/2 200 \ncontent-type: image/png\n")).toBe(true);
  expect(imageHeadersOk("HTTP/2 302 \ncontent-type: application/binary\nHTTP/2 200 \ncontent-type: image/png\n")).toBe(true);
  expect(imageHeadersOk("HTTP/2 302 \ncontent-type: application/binary\nHTTP/2 404 \ncontent-type: text/html\n")).toBe(false);
  expect(imageHeadersOk("HTTP/2 200 \ncontent-type: text/html\n")).toBe(false);
});

test("rclone: remoteName reads the segment before the first colon, or nothing", () => {
  expect(remoteName("gdrive:PR-Shots/repo/branch/")).toBe("gdrive");
  expect(remoteName("gdrive:")).toBe("gdrive");
  expect(remoteName("PR-Shots/repo")).toBe("");
  expect(remoteName(":path")).toBe("");
});

test("rclone: normalizeDest guarantees a single trailing slash", () => {
  expect(normalizeDest("gdrive:PR-Shots/repo")).toBe("gdrive:PR-Shots/repo/");
  expect(normalizeDest("gdrive:PR-Shots/repo/")).toBe("gdrive:PR-Shots/repo/");
});

test("rclone: basename returns the last path segment", () => {
  expect(basename("/Users/x/shots/home.png")).toBe("home.png");
  expect(basename("home.png")).toBe("home.png");
});

test("rclone: extractDriveFileId reads open and /d/ urls, else null", () => {
  expect(extractDriveFileId("https://drive.google.com/open?id=EXAMPLEFILEID123")).toBe("EXAMPLEFILEID123");
  expect(extractDriveFileId("https://drive.google.com/file/d/EXAMPLEFILEID123/view")).toBe("EXAMPLEFILEID123");
  expect(extractDriveFileId("https://example.com/nope")).toBeNull();
});

test("rclone: embedUrl builds the direct high-res googleusercontent form", () => {
  expect(embedUrl("ABC123", DEFAULT_EMBED_WIDTH)).toBe("https://lh3.googleusercontent.com/d/ABC123=w2560");
  expect(embedUrl("ABC123", 3840)).toBe("https://lh3.googleusercontent.com/d/ABC123=w3840");
});

test("rclone: rcloneRemoteConfigured matches an exact remote line", () => {
  expect(rcloneRemoteConfigured("gdrive", "gdrive:\ndropbox:\n")).toBe(true);
  expect(rcloneRemoteConfigured("gdrive", "dropbox:\n")).toBe(false);
  expect(rcloneRemoteConfigured("gdrive", "gdrive2:\n")).toBe(false);
});

test("gh: commentApiPath maps a PR or issue comment URL to its API path", () => {
  expect(commentApiPath("https://github.com/octo/app/pull/42#issuecomment-123\n")).toBe("repos/octo/app/issues/comments/123");
  expect(commentApiPath("https://github.com/octo/app/issues/7#issuecomment-9")).toBe("repos/octo/app/issues/comments/9");
  expect(commentApiPath("https://github.com/octo/app/pull/42")).toBeNull();
  expect(commentApiPath("")).toBeNull();
});

test("gh: attachmentUrl finds the uploaded image in the comment body", () => {
  expect(attachmentUrl("![tests](https://github.com/user-attachments/assets/1a2b-3c4d)\n")).toBe("https://github.com/user-attachments/assets/1a2b-3c4d");
  expect(attachmentUrl("<img alt=\"x\" src=\"https://example.com/x.png\">")).toBeNull();
  expect(attachmentUrl("![x](./local.png)")).toBeNull();
});
