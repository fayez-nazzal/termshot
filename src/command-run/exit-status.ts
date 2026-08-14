export type CommandOutcome = { state: "exited"; code: number } | { state: "running" } | { state: "unreadable" };

export function parseExitStatus(raw: string): CommandOutcome {
  let result: CommandOutcome;
  const trimmed = raw.trim();
  if (trimmed === "") {
    result = { state: "running" };
  } else if (/^\d+$/.test(trimmed)) {
    result = { state: "exited", code: Number(trimmed) };
  } else {
    result = { state: "unreadable" };
  }
  return result;
}
