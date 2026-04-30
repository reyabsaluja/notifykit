import type {
  ChannelType,
  DatabaseAdapter,
  DeliveryRecord,
  EmailProvider,
  GetPreferenceInput,
  Hooks,
  InboxItem,
  NotificationDefinition,
  NotificationRecord,
  PayloadSchema,
  Recipient,
  RecipientPreference,
  SendInput,
  UpdatePreferenceInput,
  UpsertRecipientInput,
} from "./types.js";
import { NotifyKitError, renderTemplate, validatePayload } from "./utils.js";

export type CreateNotifyKitInput<
  T extends readonly NotificationDefinition<string, PayloadSchema>[],
> = {
  notifications: T;
  database: DatabaseAdapter;
  providers?: {
    email?: EmailProvider;
  };
  on?: Hooks;
};

export type SendResult = {
  notification: NotificationRecord;
  inboxItems: InboxItem[];
  deliveries: DeliveryRecord[];
  skippedChannels: ChannelType[];
};

export type NotifyKit<
  T extends readonly NotificationDefinition<string, PayloadSchema>[],
> = {
  upsertRecipient(input: UpsertRecipientInput): Promise<Recipient>;
  send(input: SendInput<T>): Promise<SendResult>;
  inbox: {
    list(recipientId: string): Promise<InboxItem[]>;
    markRead(inboxItemId: string): Promise<InboxItem | null>;
  };
  deliveries: {
    list(recipientId?: string): Promise<DeliveryRecord[]>;
  };
  preferences: {
    get(input: GetPreferenceInput<T>): Promise<RecipientPreference | null>;
    list(recipientId: string): Promise<RecipientPreference[]>;
    update(input: UpdatePreferenceInput<T>): Promise<RecipientPreference>;
  };
  /** Registered notification definitions. Read-only, for introspection. */
  readonly definitions: T;
};

export function createNotifyKit<
  const T extends readonly NotificationDefinition<string, PayloadSchema>[],
>(config: CreateNotifyKitInput<T>): NotifyKit<T> {
  const { notifications, database, providers, on } = config;

  const byId = new Map<string, NotificationDefinition<string, PayloadSchema>>();
  for (const def of notifications) {
    if (byId.has(def.id)) {
      throw new NotifyKitError(
        `Duplicate notification id: "${def.id}". Notification ids must be unique.`,
      );
    }
    byId.set(def.id, def);
  }

  async function runHook<K extends keyof Hooks>(
    name: K,
    ...args: Parameters<NonNullable<Hooks[K]>>
  ): Promise<void> {
    const fn = on?.[name];
    if (!fn) return;
    try {
      // @ts-expect-error — dispatch to the user-provided hook with matching args
      await fn(...args);
    } catch (err) {
      // Surface hook errors; userland can catch if needed
      throw err instanceof Error
        ? err
        : new Error(`Hook "${String(name)}" threw a non-error value.`);
    }
  }

  async function send(rawInput: SendInput<T>): Promise<SendResult> {
    const input = rawInput as {
      recipientId: string;
      notificationId: string;
      payload: unknown;
    };
    const def = byId.get(input.notificationId);
    if (!def) {
      throw new NotifyKitError(
        `Unknown notification id: "${input.notificationId}".`,
      );
    }

    const recipient = await database.recipients.findById(input.recipientId);
    if (!recipient) {
      throw new NotifyKitError(
        `Unknown recipient: "${input.recipientId}". Call upsertRecipient() first.`,
      );
    }

    const payload = validatePayload(def.payload, input.payload, def.id);

    const preference = await database.preferences.get(recipient.id, def.id);
    const isChannelAllowed = (type: ChannelType): boolean => {
      if (!preference) return true;
      const value = preference.channels[type];
      return value !== false;
    };

    const notificationRecord = await database.notifications.create({
      recipientId: recipient.id,
      notificationId: def.id,
      payload,
    });
    await runHook("notification.created", { notification: notificationRecord });

    const inboxItems: InboxItem[] = [];
    const deliveries: DeliveryRecord[] = [];
    const skippedChannels: ChannelType[] = [];

    for (const ch of def.channels) {
      if (!isChannelAllowed(ch.type)) {
        skippedChannels.push(ch.type);
        continue;
      }
      if (ch.type === "inbox") {
        const item = await database.inbox.create({
          notificationRecordId: notificationRecord.id,
          recipientId: recipient.id,
          notificationId: def.id,
          title: renderTemplate(ch.title, payload),
          body: ch.body !== undefined ? renderTemplate(ch.body, payload) : undefined,
          actionUrl:
            ch.actionUrl !== undefined
              ? renderTemplate(ch.actionUrl, payload)
              : undefined,
        });
        inboxItems.push(item);
        await runHook("inbox.created", { inboxItem: item });
      } else if (ch.type === "email") {
        const provider = providers?.email;
        if (!provider) {
          throw new NotifyKitError(
            `Notification "${def.id}" has an email channel but no email provider is configured.`,
          );
        }
        if (!recipient.email) {
          throw new NotifyKitError(
            `Recipient "${recipient.id}" has no email address; cannot send email notification "${def.id}".`,
          );
        }

        const subject = renderTemplate(ch.subject, payload);
        const body = renderTemplate(ch.body, payload);

        const delivery = await database.deliveries.create({
          notificationRecordId: notificationRecord.id,
          recipientId: recipient.id,
          notificationId: def.id,
          channel: "email",
          provider: provider.id,
          status: "pending",
          to: recipient.email,
          subject,
          body,
          attempts: 0,
        });

        try {
          const result = await provider.send({
            to: recipient.email,
            subject,
            body,
          });
          const updated = await database.deliveries.update(delivery.id, {
            status: "sent",
            providerMessageId: result.providerMessageId,
            attempts: delivery.attempts + 1,
            sentAt: new Date(),
          });
          const finalRecord = updated ?? delivery;
          deliveries.push(finalRecord);
          await runHook("delivery.sent", { delivery: finalRecord });
        } catch (err) {
          const error = err instanceof Error ? err : new Error(String(err));
          const updated = await database.deliveries.update(delivery.id, {
            status: "failed",
            error: error.message,
            attempts: delivery.attempts + 1,
            failedAt: new Date(),
          });
          const finalRecord = updated ?? delivery;
          deliveries.push(finalRecord);
          await runHook("delivery.failed", { delivery: finalRecord, error });
        }
      }
    }

    return {
      notification: notificationRecord,
      inboxItems,
      deliveries,
      skippedChannels,
    };
  }

  async function updatePreference(
    rawInput: UpdatePreferenceInput<T>,
  ): Promise<RecipientPreference> {
    const input = rawInput as UpdatePreferenceInput<
      readonly NotificationDefinition<string, PayloadSchema>[]
    >;
    if (!byId.has(input.notificationId)) {
      throw new NotifyKitError(
        `Unknown notification id: "${input.notificationId}".`,
      );
    }
    const recipient = await database.recipients.findById(input.recipientId);
    if (!recipient) {
      throw new NotifyKitError(
        `Unknown recipient: "${input.recipientId}". Call upsertRecipient() first.`,
      );
    }
    return database.preferences.upsert({
      recipientId: input.recipientId,
      notificationId: input.notificationId,
      channels: input.channels,
    });
  }

  async function getPreference(
    rawInput: GetPreferenceInput<T>,
  ): Promise<RecipientPreference | null> {
    const input = rawInput as GetPreferenceInput<
      readonly NotificationDefinition<string, PayloadSchema>[]
    >;
    return database.preferences.get(input.recipientId, input.notificationId);
  }

  return {
    async upsertRecipient(input) {
      return database.recipients.upsert(input);
    },
    send,
    inbox: {
      list(recipientId) {
        return database.inbox.listByRecipient(recipientId);
      },
      markRead(inboxItemId) {
        return database.inbox.markRead(inboxItemId);
      },
    },
    deliveries: {
      list(recipientId) {
        return database.deliveries.list(recipientId);
      },
    },
    preferences: {
      get: getPreference,
      list(recipientId) {
        return database.preferences.list(recipientId);
      },
      update: updatePreference,
    },
    definitions: notifications,
  };
}
