import { DEFAULT_EMBED_WIDTH } from "../publish.ts";
import { DEFAULT_RUN_COLS, DEFAULT_RUN_ROWS } from "./flags.ts";

export function helpText(version: string): string {
  return `termshot ${version} — run a command in a fresh terminal window and capture it

USAGE
  termshot --run <command> [options]

  Runs the command in a new Ghostty window (unique title, wait-after-command)
  and captures that window via the OS (macOS: screencapture).

OPTIONS
      --run <command>     Run the command in a new Ghostty window and capture it
  -o, --output <path>     Output PNG path (default: ~/termshot/<timestamp>.png)
      --settle <ms>       Wait after the Ghostty window appears before
                          capturing (default: 500)
      --cols <n>          --run window width in terminal columns (default: ${DEFAULT_RUN_COLS})
      --rows <n>          --run window height in terminal rows (default: ${DEFAULT_RUN_ROWS})
      --publish <dest>    Upload the written PNG to an rclone remote dir (e.g.
                          gdrive:PR-Shots/<repo>/<branch>/), make it public,
                          and print a high-res PR-ready inline Drive image
                          embed to stdout
      --publish-size <px>     Long-edge width for the embed (default: ${DEFAULT_EMBED_WIDTH})
      --publish-label <text>  Alt text for the embed (default: file name)
  -h, --help              Show this help
  -v, --version           Show version
`;
}
