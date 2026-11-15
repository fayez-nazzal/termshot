// The POSIX sh script every terminal runs. It is terminal-neutral: each
// adapter in src/terminal-emulator/ runs it as `sh -c <script>`.
//
// Everything in the captured window that is not the command's own output is
// noise in a published screenshot, so the wrapper removes it:
//
//   - `Last login: ...` comes from /usr/bin/login. Clearing the screen, the
//     scrollback, and homing the cursor removes it, but the clear has to wait
//     a beat first: login can still be writing that line when `sh` starts, so
//     an immediate clear runs too early and the banner lands underneath the
//     command's output instead.
//   - A terminal's own exit banner (`Process exited. Press any key to close
//     the terminal.` and the like). Holding the window open with a
//     trailing sleep means the command never "exits" while we are capturing,
//     so no exit banner renders and a stray keypress can never echo into the
//     frame. termshot kills the terminal process itself once the capture is
//     written.
//   - Whatever sits below the output is wiped once the command has finished.
//     Erasing from the cursor down at the end removes a late login-banner
//     fragment without touching the output above. The same escape hides the
//     block cursor, which otherwise lands in the frame on whichever captures
//     catch its blink on.
//   - The trailing sleep also covers the race where a near-instant command
//     beats the terminal's startup and produces a bogus "failed to launch the
//     requested command" error screen.
export const SETTLE_BEFORE_CLEAR_SECONDS = 0.25;
export const CLEAR_SCREEN = "printf '\\033[2J\\033[3J\\033[H'";
export const TIDY_TAIL = "printf '\\033[J\\033[?25l'";
// Derived from the same budget termshot itself gives up on: run.ts waits up
// to WINDOW_TIMEOUT_MS for the window to appear and up to COMMAND_TIMEOUT_MS
// for the command to finish. Signal-safe disposal (terminal-session/session.ts)
// closes the window promptly in the normal case; this hold is only the
// worst-case backstop for a hard crash no signal handler can catch, so it
// should track that budget rather than sit open for a flat five minutes.
const WINDOW_WAIT_BUDGET_SECONDS = 15; // mirrors run.ts's WINDOW_TIMEOUT_MS
const COMMAND_RUN_BUDGET_SECONDS = 60; // mirrors run.ts's COMMAND_TIMEOUT_MS
export const HOLD_WINDOW_OPEN_SECONDS = WINDOW_WAIT_BUDGET_SECONDS + COMMAND_RUN_BUDGET_SECONDS;

export function wrappedCommand(command: string): string {
  return `sleep ${SETTLE_BEFORE_CLEAR_SECONDS}; ${CLEAR_SCREEN}; ${command}; ${TIDY_TAIL}; sleep ${HOLD_WINDOW_OPEN_SECONDS}`;
}

// Records the command's own exit status to statusPath, right after the command
// finishes and before the tail is tidied, so a poller can read a plain integer
// once it appears. Reusing wrappedCommand keeps the settle/clear/tidy/hold
// ordering it guards completely untouched: the recording command is just the
// "command" wrappedCommand wraps.
export function innerScript(command: string, statusPath: string): string {
  return wrappedCommand(`${command}; echo $? > "${statusPath}"`);
}
