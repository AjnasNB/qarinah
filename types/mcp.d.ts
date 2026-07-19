export interface QarinahMcpServer {
  readonly tools: readonly Readonly<Record<string, unknown>>[];
  handle(message: unknown): Promise<void>;
  close(error?: Error): void;
}

export function createMcpServer(options?: {
  cwd?: string;
  write?: (message: unknown) => void;
}): QarinahMcpServer;

export function runMcpServer(options?: {
  cwd?: string;
  input?: AsyncIterable<Uint8Array | string>;
  maximumFrameBytes?: number;
  write?: (message: unknown) => void;
}): Promise<void>;
