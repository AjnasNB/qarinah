function abortReason(signal) {
  try {
    signal.throwIfAborted();
  } catch (error) {
    return error;
  }
  return new DOMException("This operation was aborted", "AbortError");
}

export function validateAbortSignal(signal) {
  if (signal === undefined) return undefined;
  if (!signal
    || typeof signal !== "object"
    || typeof signal.aborted !== "boolean"
    || typeof signal.addEventListener !== "function"
    || typeof signal.removeEventListener !== "function"
    || typeof signal.throwIfAborted !== "function") {
    throw new TypeError("signal must be an AbortSignal.");
  }
  return signal;
}

export function throwIfAborted(signal) {
  if (signal !== undefined) signal.throwIfAborted();
}

export function abortableDelay(milliseconds, signal) {
  if (signal === undefined) return new Promise((resolve) => setTimeout(resolve, milliseconds));
  throwIfAborted(signal);
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, milliseconds);
    const onAbort = () => {
      clearTimeout(timeout);
      signal.removeEventListener("abort", onAbort);
      reject(abortReason(signal));
    };
    signal.addEventListener("abort", onAbort, { once: true });
    if (signal.aborted) onAbort();
  });
}
