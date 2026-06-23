import type {
  DatabaseAdapter,
  DedupeRecord,
  DeliveryRecord,
  DigestBufferEntry,
  InboxDeleteForRecipientResult,
  InboxItem,
  InboxItemForRecipientResult,
  InboxListFilter,
  NotificationRecord,
  RateLimitEvent,
  Recipient,
  RecipientPreference,
  ScheduledSend,
  SecurityScope,
  TimelineEvent,
  UpsertRecipientInput,
} from "./types.js";
import { createId } from "./utils.js";

export type MemoryAdapter = DatabaseAdapter & {
  _state: {
    recipients: Recipient[];
    notifications: NotificationRecord[];
    inboxItems: InboxItem[];
    deliveries: DeliveryRecord[];
    preferences: RecipientPreference[];
    digests: DigestBufferEntry[];
    rateLimits: RateLimitEvent[];
    scheduledSends: ScheduledSend[];
    dedupeRecords: DedupeRecord[];
    timelineEvents: TimelineEvent[];
  };
};

function normalizeLimit(limit: number | undefined | null): number | undefined {
  if (limit == null) return undefined;
  if (!Number.isSafeInteger(limit) || limit <= 0) {
    throw new RangeError("limit must be a positive integer.");
  }
  return limit;
}

function cloneValue<T>(value: T): T {
  if (value instanceof Date) return new Date(value.getTime()) as T;
  if (Array.isArray(value)) return value.map((entry) => cloneValue(entry)) as T;
  if (value && typeof value === "object") {
    const copy: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      copy[key] = cloneValue(entry);
    }
    return copy as T;
  }
  return value;
}

function cloneDate(value: Date): Date {
  return new Date(value.getTime());
}

function cloneOptionalDate<T extends Date | null | undefined>(value: T): T {
  return (value instanceof Date ? new Date(value.getTime()) : value) as T;
}

function cloneRecipient(recipient: Recipient): Recipient {
  return {
    ...recipient,
    quietHours: cloneValue(recipient.quietHours),
    createdAt: cloneDate(recipient.createdAt),
    updatedAt: cloneDate(recipient.updatedAt),
  };
}

function cloneNotification(record: NotificationRecord): NotificationRecord {
  return {
    ...record,
    payload: cloneValue(record.payload),
    payloadSchema: cloneValue(record.payloadSchema),
    createdAt: cloneDate(record.createdAt),
  };
}

function cloneInboxItem(item: InboxItem): InboxItem {
  return {
    ...item,
    readAt: cloneOptionalDate(item.readAt),
    archivedAt: cloneOptionalDate(item.archivedAt),
    createdAt: cloneDate(item.createdAt),
  };
}

function cloneDelivery(record: DeliveryRecord): DeliveryRecord {
  return {
    ...record,
    createdAt: cloneDate(record.createdAt),
    updatedAt: cloneDate(record.updatedAt),
    sentAt: cloneOptionalDate(record.sentAt),
    failedAt: cloneOptionalDate(record.failedAt),
  };
}

function clonePreference(preference: RecipientPreference): RecipientPreference {
  return {
    ...preference,
    channels: { ...preference.channels },
    updatedAt: cloneDate(preference.updatedAt),
  };
}

function cloneDigest(entry: DigestBufferEntry): DigestBufferEntry {
  return {
    ...entry,
    payloads: cloneValue(entry.payloads),
    flushAt: cloneDate(entry.flushAt),
    createdAt: cloneDate(entry.createdAt),
    updatedAt: cloneDate(entry.updatedAt),
  };
}

function cloneScheduledSend(record: ScheduledSend): ScheduledSend {
  return {
    ...record,
    payload: cloneValue(record.payload),
    scheduledFor: cloneDate(record.scheduledFor),
    claimedAt: cloneOptionalDate(record.claimedAt),
    createdAt: cloneDate(record.createdAt),
  };
}

function cloneTimelineEvent(event: TimelineEvent): TimelineEvent {
  return {
    ...event,
    metadata: cloneValue(event.metadata),
    timestamp: cloneDate(event.timestamp),
  };
}

export function memoryAdapter(): MemoryAdapter {
  const state = {
    recipients: [] as Recipient[],
    notifications: [] as NotificationRecord[],
    inboxItems: [] as InboxItem[],
    deliveries: [] as DeliveryRecord[],
    preferences: [] as RecipientPreference[],
    digests: [] as DigestBufferEntry[],
    rateLimits: [] as RateLimitEvent[],
    scheduledSends: [] as ScheduledSend[],
    dedupeRecords: [] as DedupeRecord[],
    timelineEvents: [] as TimelineEvent[],
  };
  let timelineSeqCounter = 0;

  function matchesScope(record: SecurityScope, scope?: SecurityScope): boolean {
    if (!scope) return true;
    if (scope.tenantId !== undefined && record.tenantId !== scope.tenantId) {
      return false;
    }
    if (
      scope.workspaceId !== undefined &&
      record.workspaceId !== scope.workspaceId
    ) {
      return false;
    }
    return true;
  }

  function samePreferenceScope(
    record: SecurityScope,
    scope?: SecurityScope,
  ): boolean {
    return (
      (record.tenantId ?? null) === (scope?.tenantId ?? null) &&
      (record.workspaceId ?? null) === (scope?.workspaceId ?? null)
    );
  }

  const adapter: MemoryAdapter = {
    _state: state,
    recipients: {
      async upsert(input: UpsertRecipientInput): Promise<Recipient> {
        const now = new Date();
        const existing = state.recipients.find((r) => r.id === input.id);
        if (existing) {
          if (input.tenantId !== undefined) existing.tenantId = input.tenantId;
          if (input.workspaceId !== undefined) {
            existing.workspaceId = input.workspaceId;
          }
          if (input.email !== undefined) existing.email = input.email;
          if (input.phone !== undefined) existing.phone = input.phone;
          if (input.name !== undefined) existing.name = input.name;
          if (input.quietHours !== undefined) {
            existing.quietHours = cloneValue(input.quietHours);
          }
          existing.updatedAt = now;
          return cloneRecipient(existing);
        }
        const recipient: Recipient = {
          id: input.id,
          tenantId: input.tenantId,
          workspaceId: input.workspaceId,
          email: input.email,
          phone: input.phone,
          name: input.name,
          quietHours: cloneValue(input.quietHours ?? undefined),
          createdAt: now,
          updatedAt: now,
        };
        state.recipients.push(recipient);
        return cloneRecipient(recipient);
      },
      async findById(id: string): Promise<Recipient | null> {
        const recipient = state.recipients.find((r) => r.id === id);
        return recipient ? cloneRecipient(recipient) : null;
      },
    },
    notifications: {
      async create(input): Promise<NotificationRecord> {
        const record: NotificationRecord = {
          id: createId("ntf"),
          recipientId: input.recipientId,
          tenantId: input.tenantId,
          workspaceId: input.workspaceId,
          notificationId: input.notificationId,
          payload: cloneValue(input.payload),
          payloadSchema: cloneValue(input.payloadSchema),
          definitionVersion: input.definitionVersion,
          idempotencyKey: input.idempotencyKey,
          createdAt: new Date(),
        };
        state.notifications.push(record);
        return cloneNotification(record);
      },
      async findByIdempotencyKey(key: string): Promise<NotificationRecord | null> {
        const record = state.notifications.find((n) => n.idempotencyKey === key);
        return record ? cloneNotification(record) : null;
      },
      async clearIdempotencyKey(id: string): Promise<void> {
        const record = state.notifications.find((n) => n.id === id);
        if (record) record.idempotencyKey = undefined;
      },
    },
    inbox: {
      async create(input): Promise<InboxItem> {
        const item: InboxItem = {
          id: createId("inb"),
          notificationRecordId: input.notificationRecordId,
          recipientId: input.recipientId,
          tenantId: input.tenantId,
          workspaceId: input.workspaceId,
          notificationId: input.notificationId,
          title: input.title,
          body: input.body,
          actionUrl: input.actionUrl,
          readAt: null,
          archivedAt: null,
          createdAt: new Date(),
        };
        state.inboxItems.push(item);
        return cloneInboxItem(item);
      },
      async listByRecipient(
        recipientId: string,
        scope?: SecurityScope,
        filter?: InboxListFilter,
        limit?: number,
      ): Promise<InboxItem[]> {
        const items = state.inboxItems
          .filter((i) => {
            if (i.recipientId !== recipientId || !matchesScope(i, scope)) return false;
            if (filter?.archived === true) return !!i.archivedAt;
            if (filter?.archived === false || filter?.archived === undefined) return !i.archivedAt;
            return true;
          })
          .slice()
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        const normalizedLimit = normalizeLimit(limit);
        const limited = normalizedLimit !== undefined ? items.slice(0, normalizedLimit) : items;
        return limited.map(cloneInboxItem);
      },
      async listByNotificationRecordId(notificationRecordId: string): Promise<InboxItem[]> {
        return state.inboxItems
          .filter((i) => i.notificationRecordId === notificationRecordId)
          .map(cloneInboxItem);
      },
      async markReadForRecipient(
        inboxItemId: string,
        recipientId: string,
        scope?: SecurityScope,
      ) {
        const item = state.inboxItems.find((i) => i.id === inboxItemId);
        if (!item) return { status: "not_found" };
        if (item.recipientId !== recipientId || !matchesScope(item, scope)) {
          return { status: "forbidden" };
        }
        if (!item.readAt) item.readAt = new Date();
        return { status: "marked", item: cloneInboxItem(item) };
      },
      async unreadCount(
        recipientId: string,
        scope?: SecurityScope,
      ): Promise<number> {
        let count = 0;
        for (const i of state.inboxItems) {
          if (
            i.recipientId === recipientId &&
            matchesScope(i, scope) &&
            !i.readAt &&
            !i.archivedAt
          ) {
            count++;
          }
        }
        return count;
      },
      async markAllRead(
        recipientId: string,
        scope?: SecurityScope,
      ): Promise<number> {
        const now = new Date();
        let count = 0;
        for (const i of state.inboxItems) {
          if (
            i.recipientId === recipientId &&
            matchesScope(i, scope) &&
            !i.readAt &&
            !i.archivedAt
          ) {
            i.readAt = now;
            count++;
          }
        }
        return count;
      },
      async archiveForRecipient(
        inboxItemId: string,
        recipientId: string,
        scope?: SecurityScope,
      ): Promise<InboxItemForRecipientResult> {
        const item = state.inboxItems.find((i) => i.id === inboxItemId);
        if (!item) return { status: "not_found" };
        if (item.recipientId !== recipientId || !matchesScope(item, scope)) {
          return { status: "forbidden" };
        }
        item.archivedAt = new Date();
        return { status: "ok", item: cloneInboxItem(item) };
      },
      async unarchiveForRecipient(
        inboxItemId: string,
        recipientId: string,
        scope?: SecurityScope,
      ): Promise<InboxItemForRecipientResult> {
        const item = state.inboxItems.find((i) => i.id === inboxItemId);
        if (!item) return { status: "not_found" };
        if (item.recipientId !== recipientId || !matchesScope(item, scope)) {
          return { status: "forbidden" };
        }
        item.archivedAt = null;
        return { status: "ok", item: cloneInboxItem(item) };
      },
      async deleteForRecipient(
        inboxItemId: string,
        recipientId: string,
        scope?: SecurityScope,
      ): Promise<InboxDeleteForRecipientResult> {
        const item = state.inboxItems.find((i) => i.id === inboxItemId);
        if (!item) return { status: "not_found" };
        if (item.recipientId !== recipientId || !matchesScope(item, scope)) {
          return { status: "forbidden" };
        }
        const idx = state.inboxItems.indexOf(item);
        state.inboxItems.splice(idx, 1);
        return { status: "deleted" };
      },
    },
    deliveries: {
      async create(input): Promise<DeliveryRecord> {
        const now = new Date();
        const record: DeliveryRecord = {
          id: createId("dlv"),
          notificationRecordId: input.notificationRecordId,
          recipientId: input.recipientId,
          tenantId: input.tenantId,
          workspaceId: input.workspaceId,
          notificationId: input.notificationId,
          channel: input.channel,
          provider: input.provider,
          status: input.status,
          to: input.to,
          subject: input.subject,
          body: input.body,
          providerMessageId: input.providerMessageId,
          error: input.error,
          skipReason: input.skipReason,
          skipDetails: input.skipDetails,
          attempts: input.attempts ?? 0,
          createdAt: now,
          updatedAt: now,
          sentAt: cloneOptionalDate(input.sentAt ?? null),
          failedAt: cloneOptionalDate(input.failedAt ?? null),
        };
        state.deliveries.push(record);
        return cloneDelivery(record);
      },
      async findById(id: string): Promise<DeliveryRecord | null> {
        const record = state.deliveries.find((d) => d.id === id);
        return record ? cloneDelivery(record) : null;
      },
      async listByNotificationRecordId(notificationRecordId: string): Promise<DeliveryRecord[]> {
        return state.deliveries
          .filter((d) => d.notificationRecordId === notificationRecordId)
          .map(cloneDelivery);
      },
      async update(id, patch): Promise<DeliveryRecord | null> {
        const existing = state.deliveries.find((d) => d.id === id);
        if (!existing) return null;
        const allowed = ["status", "providerMessageId", "attempts", "error", "sentAt", "failedAt", "skipReason", "skipDetails"] as const;
        for (const key of allowed) {
          if (key in patch) {
            (existing as Record<string, unknown>)[key] = cloneValue(
              patch[key as keyof typeof patch],
            );
          }
        }
        existing.updatedAt = new Date();
        return cloneDelivery(existing);
      },
      async list(
        recipientId?: string,
        scope?: SecurityScope,
        limit?: number,
      ): Promise<DeliveryRecord[]> {
        let items: DeliveryRecord[];
        if (recipientId === undefined) {
          items = state.deliveries
            .filter((d) => matchesScope(d, scope))
            .slice()
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        } else {
          items = state.deliveries
            .filter(
              (d) => d.recipientId === recipientId && matchesScope(d, scope),
            )
            .slice()
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        }
        const normalizedLimit = normalizeLimit(limit);
        const limited = normalizedLimit !== undefined ? items.slice(0, normalizedLimit) : items;
        return limited.map(cloneDelivery);
      },
    },
    preferences: {
      async get(recipientId, notificationId, scope) {
        const preference = state.preferences.find(
          (p) =>
            p.recipientId === recipientId &&
            p.notificationId === notificationId &&
            samePreferenceScope(p, scope),
        );
        return preference ? clonePreference(preference) : null;
      },
      async list(recipientId, scope) {
        return state.preferences
          .filter(
            (p) =>
              p.recipientId === recipientId && samePreferenceScope(p, scope),
          )
          .map(clonePreference);
      },
      async upsert(input) {
        const existing = state.preferences.find(
          (p) =>
            p.recipientId === input.recipientId &&
            p.notificationId === input.notificationId &&
            samePreferenceScope(p, input),
        );
        const now = new Date();
        if (existing) {
          existing.channels = { ...existing.channels, ...input.channels };
          existing.updatedAt = now;
          return clonePreference(existing);
        }
        const record: RecipientPreference = {
          recipientId: input.recipientId,
          tenantId: input.tenantId,
          workspaceId: input.workspaceId,
          notificationId: input.notificationId,
          channels: { ...input.channels },
          updatedAt: now,
        };
        state.preferences.push(record);
        return clonePreference(record);
      },
    },
    digests: {
      async append(input): Promise<DigestBufferEntry> {
        const now = new Date();
        const existing = state.digests.find((d) => d.key === input.key);
        if (existing) {
          existing.payloads.push(cloneValue(input.payload));
          existing.updatedAt = now;
          return cloneDigest(existing);
        }
        const entry: DigestBufferEntry = {
          key: input.key,
          recipientId: input.recipientId,
          tenantId: input.tenantId,
          workspaceId: input.workspaceId,
          notificationId: input.notificationId,
          payloads: [cloneValue(input.payload)],
          flushAt: new Date(now.getTime() + input.windowMs),
          createdAt: now,
          updatedAt: now,
        };
        state.digests.push(entry);
        return cloneDigest(entry);
      },
      async take(key: string): Promise<DigestBufferEntry | null> {
        const idx = state.digests.findIndex((d) => d.key === key);
        if (idx < 0) return null;
        const [entry] = state.digests.splice(idx, 1);
        return entry ? cloneDigest(entry) : null;
      },
      async restore(entry: DigestBufferEntry): Promise<DigestBufferEntry> {
        const existing = state.digests.find((d) => d.key === entry.key);
        if (existing) {
          existing.payloads = [
            ...cloneValue(entry.payloads),
            ...existing.payloads,
          ];
          existing.updatedAt = new Date();
          return cloneDigest(existing);
        }
        const copy = {
          ...entry,
          payloads: cloneValue(entry.payloads),
          flushAt: cloneDate(entry.flushAt),
          createdAt: cloneDate(entry.createdAt),
          updatedAt: cloneDate(entry.updatedAt),
        };
        state.digests.push(copy);
        return cloneDigest(copy);
      },
      async list(): Promise<DigestBufferEntry[]> {
        return state.digests.map(cloneDigest);
      },
    },
    rateLimits: {
      async reserve(input): Promise<{ allowed: boolean }> {
        const cutoff = Date.now() - input.windowMs;
        state.rateLimits = state.rateLimits.filter(
          (e) => e.occurredAt.getTime() >= cutoff,
        );
        let n = 0;
        for (const e of state.rateLimits) {
          if (e.key === input.key) n++;
        }
        if (n >= input.max) return { allowed: false };
        const event: RateLimitEvent = {
          key: input.key,
          recipientId: input.recipientId,
          tenantId: input.tenantId,
          workspaceId: input.workspaceId,
          notificationId: input.notificationId,
          occurredAt: new Date(),
        };
        state.rateLimits.push(event);
        return { allowed: true };
      },
      async count(input): Promise<number> {
        const cutoff = Date.now() - input.windowMs;
        state.rateLimits = state.rateLimits.filter(
          (e) => e.occurredAt.getTime() >= cutoff,
        );
        let n = 0;
        for (const e of state.rateLimits) {
          if (e.key === input.key) n++;
        }
        return n;
      },
    },
    scheduledSends: {
      async create(input): Promise<ScheduledSend> {
        const record: ScheduledSend = {
          id: createId("sch"),
          recipientId: input.recipientId,
          tenantId: input.tenantId,
          workspaceId: input.workspaceId,
          notificationId: input.notificationId,
          notificationRecordId: input.notificationRecordId,
          payload: cloneValue(input.payload),
          scheduledFor: cloneDate(input.scheduledFor),
          reason: input.reason,
          status: input.status ?? "pending",
          claimedAt: null,
          createdAt: new Date(),
        };
        state.scheduledSends.push(record);
        return cloneScheduledSend(record);
      },
      async claim(id: string): Promise<ScheduledSend | null> {
        const record = state.scheduledSends.find((s) => s.id === id);
        if (!record) return null;
        if (record.status !== "pending") return null;
        record.status = "claimed";
        record.claimedAt = new Date();
        return cloneScheduledSend(record);
      },
      async complete(id: string): Promise<void> {
        const idx = state.scheduledSends.findIndex(
          (s) => s.id === id && s.status === "claimed",
        );
        if (idx >= 0) state.scheduledSends.splice(idx, 1);
      },
      async release(id: string): Promise<void> {
        const record = state.scheduledSends.find((s) => s.id === id);
        if (!record) return;
        record.status = "pending";
        record.claimedAt = null;
      },
      async listDue(now: Date): Promise<ScheduledSend[]> {
        const t = now.getTime();
        return state.scheduledSends
          .filter(
            (s) => s.status === "pending" && s.scheduledFor.getTime() <= t,
          )
          .sort((a, b) => a.scheduledFor.getTime() - b.scheduledFor.getTime())
          .map(cloneScheduledSend);
      },
      async list(): Promise<ScheduledSend[]> {
        return state.scheduledSends.map(cloneScheduledSend);
      },
    },
    timeline: {
      async append(events): Promise<TimelineEvent[]> {
        const now = new Date();
        const baseSeq = timelineSeqCounter;
        timelineSeqCounter += events.length;
        const records: TimelineEvent[] = events.map((e, i) => ({
          id: createId("tl"),
          seq: baseSeq + i,
          notificationRecordId: e.notificationRecordId,
          deliveryId: e.deliveryId,
          recipientId: e.recipientId,
          tenantId: e.tenantId,
          workspaceId: e.workspaceId,
          notificationId: e.notificationId,
          channel: e.channel,
          provider: e.provider,
          event: e.event,
          message: e.message,
          metadata: cloneValue(e.metadata),
          timestamp: now,
        }));
        state.timelineEvents.push(...records);
        return records.map(cloneTimelineEvent);
      },
      async listByNotificationRecordId(notificationRecordId: string, limit?: number): Promise<TimelineEvent[]> {
        const sorted = state.timelineEvents
          .filter((e) => e.notificationRecordId === notificationRecordId)
          .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime() || a.seq - b.seq);
        const normalizedLimit = normalizeLimit(limit);
        const limited = normalizedLimit !== undefined ? sorted.slice(0, normalizedLimit) : sorted;
        return limited.map(cloneTimelineEvent);
      },
      async listByDeliveryId(deliveryId: string, notificationRecordId?: string, limit?: number): Promise<TimelineEvent[]> {
        const sorted = state.timelineEvents
          .filter((e) => e.deliveryId === deliveryId && (!notificationRecordId || e.notificationRecordId === notificationRecordId))
          .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime() || a.seq - b.seq);
        const normalizedLimit = normalizeLimit(limit);
        const limited = normalizedLimit !== undefined ? sorted.slice(0, normalizedLimit) : sorted;
        return limited.map(cloneTimelineEvent);
      },
      async prune(olderThan: Date): Promise<number> {
        const cutoff = olderThan.getTime();
        const before = state.timelineEvents.length;
        state.timelineEvents = state.timelineEvents.filter((e) => e.timestamp.getTime() >= cutoff);
        return before - state.timelineEvents.length;
      },
    },
    dedupe: {
      async check(input): Promise<{ duplicate: boolean }> {
        const now = Date.now();
        const existing = state.dedupeRecords.find((r) => r.key === input.key);
        if (existing) {
          if (existing.expiresAt.getTime() > now) {
            return { duplicate: true };
          }
          const idx = state.dedupeRecords.indexOf(existing);
          state.dedupeRecords.splice(idx, 1);
        }
        state.dedupeRecords.push({
          key: input.key,
          recipientId: input.recipientId,
          tenantId: input.tenantId,
          workspaceId: input.workspaceId,
          notificationId: input.notificationId,
          expiresAt: new Date(now + input.windowMs),
          createdAt: new Date(now),
        });
        return { duplicate: false };
      },
      async exists(key: string): Promise<boolean> {
        const now = Date.now();
        const record = state.dedupeRecords.find((r) => r.key === key);
        return !!record && record.expiresAt.getTime() > now;
      },
      async prune(): Promise<void> {
        const now = Date.now();
        state.dedupeRecords = state.dedupeRecords.filter(
          (r) => r.expiresAt.getTime() > now,
        );
      },
    },
  };

  return adapter;
}
