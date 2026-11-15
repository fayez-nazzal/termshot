export interface SignalPort {
  onExit(handler: () => void): void;
  onSignal(signal: NodeJS.Signals, handler: () => void): void;
}

export function processSignalPort(): SignalPort {
  return {
    onExit: (handler: () => void) => {
      process.on("exit", handler);
    },
    onSignal: (signal: NodeJS.Signals, handler: () => void) => {
      process.on(signal, handler);
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

export function registerSignalSafeDisposal(dispose: () => void, signals: SignalPort): void {
  signals.onExit(dispose);
  signals.onSignal("SIGINT", dispose);
  signals.onSignal("SIGTERM", dispose);
}
