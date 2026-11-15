export interface LaunchSpec {
  title: string;
  script: string;
  cols: number;
  rows: number;
}

export interface TerminalEmulator {
  readonly id: string;
  readonly displayName: string;
  readonly executable: string;
  launchArgv(spec: LaunchSpec): string[];
}
