import type { TimelineEvent } from "@notifykitjs/core";

export function rowToTimelineEvent(row: {
  id: string;
  seq: number;
  notificationRecordId: string;
  deliveryId: string | null;
  recipientId: string;
  tenantId: string | null;
  workspaceId: string | null;
  notificationId: string;
  channel: string | null;
  provider: string | null;
  event: string;
  message: string;
  metadata: Record<string, unknown> | null;
  timestamp: Date;
}): TimelineEvent {
  return {
    id: row.id,
    seq: row.seq,
    notificationRecordId: row.notificationRecordId,
    deliveryId: row.deliveryId ?? undefined,
    recipientId: row.recipientId,
    tenantId: row.tenantId ?? undefined,
    workspaceId: row.workspaceId ?? undefined,
    notificationId: row.notificationId,
    channel: (row.channel ?? undefined) as TimelineEvent["channel"],
    provider: row.provider ?? undefined,
    // Cast, not validate: allows forward-compatibility when newer writers add event types.
    event: row.event as TimelineEvent["event"],
    message: row.message,
    metadata: (row.metadata ?? undefined) as Record<string, unknown> | undefined,
    timestamp: row.timestamp,
  };
}
