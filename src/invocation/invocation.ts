import type { PublisherId } from "../publishing/registry.ts";

export interface Invocation {
  command: string;
  output: string | null;
  cols: number | null;
  rows: number | null;
  publishDest: string | null;
  publishSize: number;
  publishLabel: string | null;
  publisher: PublisherId | null;
}
