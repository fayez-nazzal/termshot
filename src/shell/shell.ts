export interface Shell {
  readonly id: string;
  readonly executable: string;
  argv(executablePath: string, command: string): string[];
}

export class ShellNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ShellNotFoundError";
  }
}
