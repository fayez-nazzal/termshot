import { CONFIG_KEY_NAMES, SETTINGS } from "../configuration/config.ts";
import { DEFAULT_EMBED_WIDTH } from "../publishing/publisher.ts";
import { PUBLISHER_IDS, publisherFor } from "../publishing/registry.ts";

function configKeyLines(): string {
  return CONFIG_KEY_NAMES.map((key) => `  ${key.padEnd(22)}${SETTINGS[key].description} (default: ${SETTINGS[key].default})`).join("\n");
}

function publisherLines(): string {
  return PUBLISHER_IDS.map((id) => `                            ${id}: ${publisherFor(id).destinationFormat}`).join("\n");
}

function resizingPublishers(): string {
  return PUBLISHER_IDS.filter((id) => publisherFor(id).resizesEmbed).join(", ");
}

export function helpText(version: string): string {
  return `termshot ${version} — run a command in a built-in headless terminal and render it to a PNG

USAGE
  termshot --run <command> [options]
  termshot config [set <key> <value> | unset <key>]

  Runs the command in a built-in headless terminal and renders it to a PNG.
  No terminal app or screen capture permission is involved.

OPTIONS
      --run <command>     Run the command and render its output
  -o, --output <path>     Output PNG path (default: .termshot/captures/<timestamp>.png
                          in a project, else ~/termshot/<timestamp>.png)
      --cols <n>          Terminal width in columns (default: ${SETTINGS.cols.default})
      --rows <n>          Most terminal rows shown (default: ${SETTINGS.rows.default})
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

  Stored in .termshot/config.json at the project root.

KEYS
${configKeyLines()}
`;
}
