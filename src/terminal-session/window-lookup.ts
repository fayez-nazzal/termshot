// The only JXA in the repo. Resolves a terminal window strictly by the pid
// that owns it, never by title or owner-name substring matching, so a window
// can never be picked up by accident just because its title happens to
// contain "termshot".

export interface WindowInfo {
  id: number;
  owner: string;
  name: string;
  layer: number;
  pid: number;
}

export class AmbiguousWindowError extends Error {
  constructor(pid: number, windowIds: number[]) {
    super(`pid ${pid} owns ${windowIds.length} windows (${windowIds.join(", ")}); termshot cannot pick one non-interactively`);
    this.name = "AmbiguousWindowError";
  }
}

// List on-screen windows (macOS only) via CoreGraphics through JXA.
function queryWindows(): WindowInfo[] {
  if (process.platform !== "darwin") {
    throw new Error(`window listing not supported on ${process.platform} (macOS only)`);
  }
  // Numeric options: kCGWindowListOptionOnScreenOnly(1) | kCGWindowListExcludeDesktopElements(16).
  // The named $.kCG* constants do not resolve through the JXA bridge here, and the
  // CFArrayRef result must be cast with ObjC.castRefToObject before use.
  const jxa = `
    ObjC.import('CoreGraphics');
    function run() {
      var ref = $.CGWindowListCopyWindowInfo(17, 0);
      var arr = ObjC.castRefToObject(ref);
      if (!arr) return '[]';
      var n = arr.count;
      var out = [];
      for (var i = 0; i < n; i++) {
        var d = arr.objectAtIndex(i);
        var num = d.objectForKey('kCGWindowNumber');
        var owner = d.objectForKey('kCGWindowOwnerName');
        var name = d.objectForKey('kCGWindowName');
        var layer = d.objectForKey('kCGWindowLayer');
        var pid = d.objectForKey('kCGWindowOwnerPID');
        out.push({
          id: num ? num.intValue : null,
          owner: owner ? ObjC.unwrap(owner) : '',
          name: name ? ObjC.unwrap(name) : '',
          layer: layer ? layer.intValue : 0,
          pid: pid ? pid.intValue : 0,
        });
      }
      return JSON.stringify(out);
    }
  `;
  const proc = Bun.spawnSync(["osascript", "-l", "JavaScript", "-e", jxa]);
  if (!proc.success) {
    const err = new TextDecoder().decode(proc.stderr).trim();
    throw new Error(`window listing failed: ${err || `exit ${proc.exitCode}`}`);
  }
  const raw = new TextDecoder().decode(proc.stdout).trim();
  let parsed: WindowInfo[];
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`could not parse window list from osascript: ${raw.slice(0, 200)}`);
  }
  return parsed;
}

// PURE. Given a window list, resolves the one window owned by pid. Throws a
// named error rather than silently taking the first match when a pid owns
// more than one window, since a wrong-but-successful capture is worse than a
// loud failure.
export function resolveWindowIdByPid(windows: WindowInfo[], pid: number): number | undefined {
  const matches = windows.filter((w) => w.pid === pid);
  let result: number | undefined;
  if (matches.length > 1) {
    throw new AmbiguousWindowError(
      pid,
      matches.map((w) => w.id),
    );
  } else if (matches.length === 1) {
    result = matches[0]!.id;
  }
  return result;
}

export function findWindowIdByPid(pid: number): number | undefined {
  return resolveWindowIdByPid(queryWindows(), pid);
}

// Polls until the process owns exactly one on-screen window, and returns its id.
export function waitForWindow(pid: number, timeoutMs: number): number {
  const deadline = Date.now() + timeoutMs;
  let id = findWindowIdByPid(pid);
  while (id == null && Date.now() < deadline) {
    Bun.sleepSync(250);
    id = findWindowIdByPid(pid);
  }
  if (id == null) {
    throw new Error(`terminal process ${pid} did not open a window within ${timeoutMs}ms`);
  }
  return id;
}
