import type {
  ChannelPreferenceMap,
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
    input: Omit<UpdatePreferenceInput<T>, "recipientId" | "tenantId" | "workspaceId" | "organizationId">,
  ) => Promise<RecipientPreference>;
  getGlobalPreference: () => Promise<RecipientPreference | null>;
  updateGlobalPreference: (input: {
    channels: ChannelPreferenceMap;
  }) => Promise<RecipientPreference>;
  getCategoryPreference: (category: string) => Promise<RecipientPreference | null>;
  listCategoryPreferences: () => Promise<RecipientPreference[]>;
  updateCategoryPreference: (input: {
    category: string;
    channels: ChannelPreferenceMap;
  }) => Promise<RecipientPreference>;
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
    if (!value) throw new Error("identify() returned an empty string");
    return { recipientId: value };
  }
  if (!value.recipientId) {
    throw new Error("identify() returned an object with an empty recipientId");
  }
  return value;
}

const VALID_CHANNEL_KEYS = new Set(["inbox", "email", "webhook", "sms"]);

export function createServerActions<
  T extends readonly NotificationDefinition<string, PayloadSchema>[],
>(options: ServerActionsOptions<T>): NotifyKitServerActions<T> {
  const { notifykit, identify } = options;

  async function resolveIdentity(): Promise<ServerActionsIdentity> {
    return normalizeIdentity(await identify());
  }

  function assertStringId(value: unknown): asserts value is string {
    if (typeof value !== "string" || value.length === 0 || value.length > 256 || /[\x00-\x1f]/.test(value)) {
      throw new Error("Invalid inbox item ID");
    }
  }

  function assertChannelMap(channels: unknown): asserts channels is ChannelPreferenceMap {
    if (!channels || typeof channels !== "object" || Array.isArray(channels)) {
      throw new Error("Invalid channels");
    }
    for (const [key, value] of Object.entries(channels as Record<string, unknown>)) {
      if (!VALID_CHANNEL_KEYS.has(key)) throw new Error("Invalid channel key");
      if (typeof value !== "boolean") throw new Error("Invalid channel value");
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
        ((input as Record<string, unknown>).notificationId as string).length === 0 ||
        ((input as Record<string, unknown>).notificationId as string).length > 512
      ) {
        throw new Error("Invalid notificationId");
      }
      const channels = (input as Record<string, unknown>).channels;
      if (channels !== undefined) {
        assertChannelMap(channels);
      }
      const { recipientId, ...scope } = await resolveIdentity();
      return notifykit.preferences.update({
        ...input,
        recipientId,
        ...scope,
      } as UpdatePreferenceInput<T>);
    },

    async getGlobalPreference() {
      const { recipientId, ...scope } = await resolveIdentity();
      return notifykit.preferences.getGlobal({ recipientId, ...scope });
    },

    async updateGlobalPreference(input) {
      assertChannelMap(input?.channels);
      const { recipientId, ...scope } = await resolveIdentity();
      return notifykit.preferences.updateGlobal({
        recipientId,
        ...scope,
        channels: input.channels,
      });
    },

    async getCategoryPreference(category) {
      if (typeof category !== "string" || category.length === 0 || category.length > 512) {
        throw new Error("Invalid category");
      }
      const { recipientId, ...scope } = await resolveIdentity();
      return notifykit.preferences.getCategory({ recipientId, ...scope, category });
    },

    async listCategoryPreferences() {
      const { recipientId, ...scope } = await resolveIdentity();
      return notifykit.preferences.listCategories(recipientId, scope);
    },

    async updateCategoryPreference(input) {
      if (
        !input ||
        typeof input !== "object" ||
        typeof (input as Record<string, unknown>).category !== "string" ||
        ((input as Record<string, unknown>).category as string).length === 0 ||
        ((input as Record<string, unknown>).category as string).length > 512
      ) {
        throw new Error("Invalid category");
      }
      assertChannelMap((input as Record<string, unknown>).channels);
      const { recipientId, ...scope } = await resolveIdentity();
      return notifykit.preferences.updateCategory({
        recipientId,
        ...scope,
        category: input.category,
        channels: input.channels,
      });
    },

    inbox: {
      async list(filter?) {
        if (filter !== undefined) {
          if (typeof filter !== "object" || filter === null || Array.isArray(filter)) {
            throw new Error("Invalid filter");
          }
          const f = filter as Record<string, unknown>;
          if ("archived" in f && typeof f.archived !== "boolean") {
            throw new Error("Invalid filter.archived");
          }
        }
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
