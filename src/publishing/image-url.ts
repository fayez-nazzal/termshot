import { runCommand } from "./process.ts";

export function imageMarkdown(label: string, url: string): string {
  return `![${label}](${url})`;
}

// curl -sIL concatenates a header block per hop; keep only the last status and
// content-type seen, so the final response is the one that must be a 200 image.
export function imageHeadersOk(headOutput: string): boolean {
  const lines = headOutput.split("\n");
  let lastStatusOk = false;
  let lastTypeImage = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^HTTP\//i.test(trimmed)) {
      lastStatusOk = / 200(\s|$)/.test(trimmed);
    }
    if (/^content-type:/i.test(trimmed)) {
      lastTypeImage = /content-type:\s*image\//i.test(trimmed);
    }
  }
  return lastStatusOk && lastTypeImage;
}

export function servesPublicImage(url: string): boolean {
  return imageHeadersOk(runCommand(["curl", "-sIL", url]).stdout);
}
