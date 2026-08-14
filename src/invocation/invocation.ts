export interface Invocation {
  command: string;
  output: string | null;
  settleMs: number;
  cols: number;
  rows: number;
  publishDest: string | null;
  publishSize: number;
  publishLabel: string | null;
}
