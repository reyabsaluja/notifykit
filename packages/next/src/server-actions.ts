"use server";

import type {
  InboxDeleteForRecipientResult,
  InboxItem,
  InboxItemForRecipientResult,
  InboxListFilter,
  MarkReadForRecipientResult,
  NotificationDefinition,
  NotifyKit,
  PayloadSchema,
  RecipientPreference,
  SecurityScope,
  UpdatePreferenceInput,
} from "notifykit";

export type ServerActionsIdentity = SecurityScope & {
  recipientId: string;
};

export type ServerActionsOptions<
  T extends readonly NotificationDefinition<string, PayloadSchema>[],
> = {
  notifykit: NotifyKit<T>;
  identify: () => Promise<string | ServerActionsIdentity> | string | ServerActionsIdentity;
};

export type NotifyKitServerActions<
  T extends readonly NotificationDefinition<string, PayloadSchema>[],
> = {
  getPreferences: () => Promise<RecipientPreference[]>;
  updatePreference: (
    input: Omit<UpdatePreferenceInput<T>, "recipientId" | "tenantId" | "workspaceId">,
  ) => Promise<RecipientPreference>;
  inbox: {
    list: (filter?: InboxListFilter) => Promise<InboxItem[]>;
    unreadCount: () => Promise<number>;
    markRead: (inboxItemId: string) => Promise<MarkReadForRecipientResult>;
    markAllRead: () => Promise<number>;
    archive: (inboxItemId: string) => Promise<InboxItemForRecipientResult>;
    unarchive: (inboxItemId: string) => Promise<InboxItemForRecipientResult>;
    deleteItem: (inboxItemId: string) => Promise<InboxDeleteForRecipientResult>;
  };
};

function normalizeIdentity(
  value: string | ServerActionsIdentity,
): ServerActionsIdentity {
  if (typeof value === "string") {
    return { recipientId: value };
  }
  return value;
}

export function createServerActions<
  T extends readonly NotificationDefinition<string, PayloadSchema>[],
>(options: ServerActionsOptions<T>): NotifyKitServerActions<T> {
  const { notifykit, identify } = options;

  async function resolveIdentity(): Promise<ServerActionsIdentity> {
    return normalizeIdentity(await identify());
  }

  function assertStringId(value: unknown): asserts value is string {
    if (typeof value !== "string" || value.length === 0 || value.length > 256) {
      throw new Error("Invalid inbox item ID");
    }
  }

  return {
    async getPreferences() {
      const { recipientId, ...scope } = await resolveIdentity();
      return notifykit.preferences.list(recipientId, scope);
    },

    async updatePreference(input) {
      if (
        !input ||
        typeof input !== "object" ||
        typeof (input as Record<string, unknown>).notificationId !== "string" ||
        ((input as Record<string, unknown>).notificationId as string).length > 512
      ) {
        throw new Error("Invalid notificationId");
      }
      const channels = (input as Record<string, unknown>).channels;
      if (channels !== undefined) {
        if (!channels || typeof channels !== "object" || Array.isArray(channels)) {
          throw new Error("Invalid channels");
        }
        for (const [key, value] of Object.entries(channels as Record<string, unknown>)) {
          if (typeof value !== "boolean") throw new Error("Invalid channel value");
          if (key !== "inbox" && key !== "email" && key !== "webhook") {
            throw new Error("Invalid channel key");
          }
        }
      }
      const { recipientId, ...scope } = await resolveIdentity();
      return notifykit.preferences.update({
        ...input,
        recipientId,
        ...scope,
      } as UpdatePreferenceInput<T>);
    },

    inbox: {
      async list(filter?) {
        const { recipientId, ...scope } = await resolveIdentity();
        return notifykit.inbox.list(recipientId, scope, filter);
      },

      async unreadCount() {
        const { recipientId, ...scope } = await resolveIdentity();
        return notifykit.inbox.unreadCount(recipientId, scope);
      },

      async markRead(inboxItemId) {
        assertStringId(inboxItemId);
        const { recipientId, ...scope } = await resolveIdentity();
        return notifykit.inbox.markReadForRecipient(inboxItemId, recipientId, scope);
      },

      async markAllRead() {
        const { recipientId, ...scope } = await resolveIdentity();
        return notifykit.inbox.markAllRead(recipientId, scope);
      },

      async archive(inboxItemId) {
        assertStringId(inboxItemId);
        const { recipientId, ...scope } = await resolveIdentity();
        return notifykit.inbox.archiveForRecipient(inboxItemId, recipientId, scope);
      },

      async unarchive(inboxItemId) {
        assertStringId(inboxItemId);
        const { recipientId, ...scope } = await resolveIdentity();
        return notifykit.inbox.unarchiveForRecipient(inboxItemId, recipientId, scope);
      },

      async deleteItem(inboxItemId) {
        assertStringId(inboxItemId);
        const { recipientId, ...scope } = await resolveIdentity();
        return notifykit.inbox.deleteForRecipient(inboxItemId, recipientId, scope);
      },
    },
  };
}
