import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const TERMSHOT_DIR = ".termshot";
const CAPTURES_DIR = "captures";

export interface ProjectProbe {
  exists(path: string): boolean;
  gitTopLevel(cwd: string): string | null;
}

// The nearest ancestor of cwd, cwd included, holding a .termshot folder;
// failing that the git top-level; failing that null (outside any project).
export function findProjectRoot(cwd: string, probe: ProjectProbe): string | null {
  let root: string | null = null;
  let dir: string | null = resolve(cwd);
  while (root == null && dir != null) {
    const parent = dirname(dir);
    if (probe.exists(join(dir, TERMSHOT_DIR))) {
      root = dir;
    }
    dir = parent === dir ? null : parent;
  }
  return root ?? probe.gitTopLevel(cwd);
}

export function configPathFor(root: string): string {
  return join(root, TERMSHOT_DIR, "config.json");
}

// Creates <root>/.termshot/. Only when it makes the folder does it also write
// a .gitignore for captures, so a user's own .gitignore is never touched.
export function ensureTermshotDir(root: string): string {
  const dir = join(root, TERMSHOT_DIR);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, ".gitignore"), `${CAPTURES_DIR}/\n`);
  }
  return dir;
}

export function defaultCapturePath(root: string | null, home: string, stamp: string): string {
  const file = `${stamp}.png`;
  return root != null ? join(root, TERMSHOT_DIR, CAPTURES_DIR, file) : join(home, "termshot", file);
}

function gitTopLevel(cwd: string): string | null {
  let result: string | null = null;
  const executable = Bun.which("git");
  if (executable !== null) {
    try {
      const spawned = Bun.spawnSync([executable, "rev-parse", "--show-toplevel"], { cwd, stdout: "pipe", stderr: "ignore" });
      const top = spawned.stdout.toString().trim();
      result = spawned.exitCode === 0 && top !== "" ? top : null;
    } catch {
      result = null;
    }
  }
  return result;
}

// Only a folder named .termshot marks a project, never a plain file.
function isDirectory(path: string): boolean {
  let result = false;
  try {
    result = statSync(path).isDirectory();
  } catch {
    result = false;
  }
  return result;
}

export const liveProjectProbe: ProjectProbe = { exists: isDirectory, gitTopLevel };
