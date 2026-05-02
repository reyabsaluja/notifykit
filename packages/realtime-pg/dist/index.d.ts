import type { RealtimeAdapter } from "notifykit";
export type PgNotifyConnection = {
    listen(channel: string, handler: (payload: string) => void): Promise<void> | void;
    unlisten(channel: string): Promise<void> | void;
    notify(channel: string, payload: string): Promise<void> | void;
};
export type PgRealtimeAdapterOptions = {
    connection: PgNotifyConnection;
    channel?: string;
};
export type PgRealtimeAdapter = RealtimeAdapter & {
    start(): Promise<void>;
    stop(): Promise<void>;
};
export declare function pgRealtimeAdapter(options: PgRealtimeAdapterOptions): PgRealtimeAdapter;
//# sourceMappingURL=index.d.ts.map