export interface ClaudeHookCaptureResult {
  captured: boolean;
  reason?: string;
  eventId?: string;
  hash?: string;
}

export function captureClaudeHook(
  input: Record<string, unknown>,
  options?: { cwd?: string }
): Promise<ClaudeHookCaptureResult>;
