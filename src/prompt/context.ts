export type GitRunner = (argv: string[], cwd: string) => { exitCode: number; stdout: string } | null;

const BRANCH_COMMANDS = [
  ["git", "symbolic-ref", "--short", "-q", "HEAD"],
  ["git", "rev-parse", "--short", "HEAD"],
];

export function readGitBranch(cwd: string, run: GitRunner): string | null {
  let result: string | null = null;
  let gitMissing = false;
  for (const argv of BRANCH_COMMANDS) {
    if (result === null && !gitMissing) {
      const output = run(argv, cwd);
      if (output === null) {
        gitMissing = true;
      } else if (output.exitCode === 0 && output.stdout.trim() !== "") {
        result = output.stdout.trim();
      }
    }
  }
  return result;
}

export const liveGitRunner: GitRunner = (argv, cwd) => {
  let result: { exitCode: number; stdout: string } | null = null;
  const executable = Bun.which(argv[0] ?? "git");
  if (executable !== null) {
    try {
      const spawned = Bun.spawnSync([executable, ...argv.slice(1)], { cwd, stdout: "pipe", stderr: "ignore" });
      result = { exitCode: spawned.exitCode ?? 1, stdout: spawned.stdout.toString() };
    } catch {
      result = null;
    }
  }
  return result;
};
