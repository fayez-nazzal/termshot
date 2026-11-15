export interface CommandOutput {
  ok: boolean;
  stdout: string;
  stderr: string;
}

export function runCommand(cmd: string[]): CommandOutput {
  const proc = Bun.spawnSync(cmd);
  const stdout = new TextDecoder().decode(proc.stdout);
  const stderr = new TextDecoder().decode(proc.stderr);
  return { ok: proc.success, stdout, stderr };
}

export function commandExists(name: string): boolean {
  return Bun.which(name) != null;
}
