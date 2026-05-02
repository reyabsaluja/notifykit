import type { RealtimeAdapter, SecurityScope } from "notifykit";
export type WebSocketRealtimeAdapterOptions = {
    /**
     * Authenticate the WebSocket upgrade request. Return the recipient ID and
     * scope if valid, or `null` to reject. Receives the raw request or its
     * URL search params — use whichever your auth layer supports.
     */
    authenticate: (request: Request) => Promise<WebSocketIdentity | null> | WebSocketIdentity | null;
    /**
     * Interval in milliseconds between server-sent ping frames. Clients that
     * don't respond within one interval are considered dead. Defaults to 30000.
     */
    heartbeatMs?: number;
};
export type WebSocketIdentity = {
    recipientId: string;
    tenantId?: string;
    workspaceId?: string;
};
export type WebSocketRealtimeAdapter = RealtimeAdapter & {
    /**
     * Handle a WebSocket upgrade. Call this from your server's upgrade path
     * (e.g., Bun.serve websocket handler, Deno.upgradeWebSocket, etc.).
     * Returns `null` if authentication fails.
     */
    handleUpgrade(request: Request, ws: WebSocketLike): Promise<{
        recipientId: string;
        scope: SecurityScope;
    } | null>;
    /**
     * Handle a WebSocket close event. Must be called when the socket closes to
     * clean up subscriptions.
     */
    handleClose(ws: WebSocketLike): void;
    /**
     * Number of active WebSocket connections. Useful for monitoring.
     */
    connectionCount(): number;
};
export type WebSocketLike = {
    send(data: string): void;
    close(): void;
};
export declare function webSocketRealtimeAdapter(options: WebSocketRealtimeAdapterOptions): WebSocketRealtimeAdapter;
//# sourceMappingURL=index.d.ts.map