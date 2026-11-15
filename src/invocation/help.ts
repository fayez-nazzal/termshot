import { CONFIG_KEYS, CONFIG_KEY_NAMES } from "../configuration/config.ts";
import { DEFAULT_EMBED_WIDTH } from "../publishing/publisher.ts";
import { PUBLISHER_IDS, publisherFor } from "../publishing/registry.ts";
import { TERMINAL_IDS } from "../terminal-emulator/registry.ts";
import { DEFAULT_RUN_COLS, DEFAULT_RUN_ROWS } from "./flags.ts";

function configKeyLines(): string {
  return CONFIG_KEY_NAMES.map((key) => `  ${key.padEnd(22)}${CONFIG_KEYS[key].description} (default: ${CONFIG_KEYS[key].default})`).join("\n");
}

function publisherLines(): string {
  return PUBLISHER_IDS.map((id) => `                            ${id}: ${publisherFor(id).destinationFormat}`).join("\n");
}

function resizingPublishers(): string {
  return PUBLISHER_IDS.filter((id) => publisherFor(id).resizesEmbed).join(", ");
}

export function helpText(version: string): string {
  return `termshot ${version} — run a command in a fresh terminal window and capture it

USAGE
  termshot --run <command> [options]
  termshot config [set <key> <value> | unset <key>]

  Runs the command in a new window of the configured terminal and captures
  that window via the OS (macOS: screencapture).

OPTIONS
      --run <command>     Run the command in a new terminal window and capture it
  -o, --output <path>     Output PNG path (default: ~/termshot/<timestamp>.png)
      --terminal <name>   Terminal for this run only, overriding the config
                          (${TERMINAL_IDS.join(", ")})
      --settle <ms>       Wait after the window appears before
                          capturing (default: 500)
      --cols <n>          --run window width in terminal columns (default: ${DEFAULT_RUN_COLS})
      --rows <n>          --run window height in terminal rows (default: ${DEFAULT_RUN_ROWS})
      --publish <dest>    Upload the written PNG and put a Markdown
                          image embed in the record. <dest> depends on the
                          configured publisher:
${publisherLines()}
      --publisher <name>  Publisher for this run only, overriding the config
                          (${PUBLISHER_IDS.join(", ")})
      --publish-size <px>     Long-edge width for the embed (default: ${DEFAULT_EMBED_WIDTH};
                              only ${resizingPublishers()} resizes)
      --publish-label <text>  Alt text for the embed (default: output path)
  -h, --help              Show this help
  -v, --version           Show version

CONFIG
  termshot config                     Print the effective config as one JSON line
  termshot config set <key> <value>   Save a value
  termshot config unset <key>         Revert a key to its default

  Stored in $XDG_CONFIG_HOME/termshot/config.json (default ~/.config/termshot/).

KEYS
${configKeyLines()}
`;
}
