// Each registration returns a function that removes the listener again.
export interface SignalPort {
  onExit(handler: () => void): () => void;
  onSignal(signal: NodeJS.Signals, handler: () => void): () => void;
}

export function processSignalPort(): SignalPort {
  return {
    onExit: (handler: () => void) => {
      process.on("exit", handler);
      return () => {
        process.off("exit", handler);
      };
    },
    onSignal: (signal: NodeJS.Signals, handler: () => void) => {
      process.on(signal, handler);
      return () => {
        process.off(signal, handler);
      };
    },
  };
}

// Wraps kill so that no matter how many times dispose is called, or which
// caller calls it first (an explicit dispose in the pipeline, or a signal
// firing), the underlying kill only ever runs once.
export function idempotentDisposer(kill: () => void): () => void {
  let disposed = false;
  return () => {
    if (!disposed) {
      disposed = true;
      kill();
    }
  };
}

// Returns a function that removes the listeners. Call it once the command is
// reaped, so later signals get their default behavior back.
export function registerSignalSafeDisposal(dispose: () => void, signals: SignalPort): () => void {
  const removers = [signals.onExit(dispose), signals.onSignal("SIGINT", dispose), signals.onSignal("SIGTERM", dispose)];
  return () => {
    for (const remove of removers) {
      remove();
    }
  };
}
