export interface CodexHookCaptureResult {
  captured: boolean;
  reason?: string;
  eventId?: string;
  hash?: string;
}

export function captureCodexHook(
  input: Record<string, unknown>,
  options?: { cwd?: string }
): Promise<CodexHookCaptureResult>;
