import type { DatabaseAdapter, DeliveryRecord, DigestBufferEntry, InboxItem, NotificationRecord, Recipient, RecipientPreference } from "./types.js";
export type MemoryAdapter = DatabaseAdapter & {
    _state: {
        recipients: Recipient[];
        notifications: NotificationRecord[];
        inboxItems: InboxItem[];
        deliveries: DeliveryRecord[];
        preferences: RecipientPreference[];
        digests: DigestBufferEntry[];
    };
};
export declare function memoryAdapter(): MemoryAdapter;
//# sourceMappingURL=memory-adapter.d.ts.map