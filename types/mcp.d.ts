export interface QarinahMcpServer {
  readonly tools: readonly Readonly<Record<string, unknown>>[];
  handle(message: unknown): Promise<void>;
  close(error?: Error): void;
}

export function createMcpServer(options?: {
  cwd?: string;
  write?: (message: unknown) => void;
  queryPermit?: {
    workspaceId: `ws_${string}`;
    policyHash: `sha256:${string}`;
    maxChars?: number;
    maxItems?: number;
  };
}): QarinahMcpServer;

export function runMcpServer(options?: {
  cwd?: string;
  input?: AsyncIterable<Uint8Array | string>;
  maximumFrameBytes?: number;
  write?: (message: unknown) => void;
  queryPermit?: {
    workspaceId: `ws_${string}`;
    policyHash: `sha256:${string}`;
    maxChars?: number;
    maxItems?: number;
  };
}): Promise<void>;
