// The command's environment: the caller's variables, plus the ones that make
// tools emit color and never stop in a pager. termName is passed in so the
// emulator's name stays in its own domain.
export function commandEnv(base: Record<string, string | undefined>, termName: string, cols: number, rows: number): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(base)) {
    if (value !== undefined) {
      result[key] = value;
    }
  }
  result.TERM = termName;
  result.COLORTERM = "truecolor";
  result.FORCE_COLOR = "1";
  result.CLICOLOR_FORCE = "1";
  result.COLUMNS = String(cols);
  result.LINES = String(rows);
  result.PAGER = "cat";
  result.GIT_PAGER = "cat";
  result.MANPAGER = "cat";
  return result;
}
