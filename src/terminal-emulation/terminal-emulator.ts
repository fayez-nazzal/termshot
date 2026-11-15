export type CellColor =
  | { kind: "default" }
  | { kind: "palette"; index: number }
  | { kind: "rgb"; rgb: number };

export interface Cell {
  char: string;
  width: 0 | 1 | 2;
  fg: CellColor;
  bg: CellColor;
  bold: boolean;
  dim: boolean;
  italic: boolean;
  underline: boolean;
  inverse: boolean;
}

export type Row = Cell[];

export interface TerminalEmulator {
  render(bytes: Uint8Array, cols: number, rows: number): Promise<Row[]>;
}
