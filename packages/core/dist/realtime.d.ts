import type { InboxItem, SecurityScope } from "./types.js";
export type RealtimeEvent = {
    type: "inbox.created";
    item: InboxItem;
} | {
    type: "inbox.updated";
    item: InboxItem;
} | {
    type: "inbox.deleted";
    itemId: string;
} | {
    type: "inbox.all_read";
    count: number;
};
export type RealtimeListener = (event: RealtimeEvent) => void;
export type RealtimeAdapter = {
    publish(recipientId: string, scope: SecurityScope, event: RealtimeEvent): void;
    subscribe(recipientId: string, scope: SecurityScope, listener: RealtimeListener): () => void;
};
export declare function memoryRealtimeAdapter(): RealtimeAdapter;
//# sourceMappingURL=realtime.d.ts.map