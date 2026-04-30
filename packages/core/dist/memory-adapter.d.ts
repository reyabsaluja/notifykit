import type { DatabaseAdapter, DeliveryRecord, InboxItem, NotificationRecord, Recipient } from "./types.js";
export type MemoryAdapter = DatabaseAdapter & {
    _state: {
        recipients: Recipient[];
        notifications: NotificationRecord[];
        inboxItems: InboxItem[];
        deliveries: DeliveryRecord[];
    };
};
export declare function memoryAdapter(): MemoryAdapter;
//# sourceMappingURL=memory-adapter.d.ts.map