import type {
  ChannelPreferenceMap,
  InboxItem,
  RecipientPreference,
} from "notifykit";

export type ClientStatus = "idle" | "loading" | "ready" | "error";

export type NotificationMetadata = {
  id: string;
  channels: string[];
  payload: Record<string, string>;
};

export type ClientState = {
  inbox: {
    items: InboxItem[];
    status: ClientStatus;
    error: string | null;
  };
  preferences: {
    items: RecipientPreference[];
    status: ClientStatus;
    error: string | null;
  };
};

export type CreateNotifyKitClientOptions = {
  /**
   * URL prefix where the NotifyKit handler is mounted.
   * Defaults to "/api/notifykit".
   */
  baseUrl?: string;
  /**
   * Custom fetch implementation. Useful for SSR, testing, or
   * injecting auth headers. Defaults to globalThis.fetch.
   */
  fetch?: typeof fetch;
  /**
   * Passed to every request. Defaults to "same-origin".
   */
  credentials?: RequestCredentials;
  /**
   * Extra headers merged into every request.
   */
  headers?: Record<string, string>;
};

export type NotifyKitClient = {
  getState(): ClientState;
  subscribe(listener: () => void): () => void;
  inbox: {
    list(): Promise<InboxItem[]>;
    markRead(inboxItemId: string): Promise<InboxItem | null>;
  };
  preferences: {
    list(): Promise<RecipientPreference[]>;
    update(input: {
      notificationId: string;
      channels: ChannelPreferenceMap;
    }): Promise<RecipientPreference>;
  };
  notifications: {
    list(): Promise<NotificationMetadata[]>;
  };
};

export function createNotifyKitClient(
  options: CreateNotifyKitClientOptions = {},
): NotifyKitClient {
  const baseUrl = (options.baseUrl ?? "/api/notifykit").replace(/\/+$/, "");
  const fetchImpl = options.fetch ?? globalThis.fetch;
  if (!fetchImpl) {
    throw new Error(
      "createNotifyKitClient: no fetch implementation available. Pass `fetch` in options.",
    );
  }
  const credentials = options.credentials ?? "same-origin";
  const extraHeaders = options.headers ?? {};

  let state: ClientState = {
    inbox: { items: [], status: "idle", error: null },
    preferences: { items: [], status: "idle", error: null },
  };
  const listeners = new Set<() => void>();

  function setState(next: ClientState) {
    state = next;
    for (const l of listeners) l();
  }

  async function request(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<unknown> {
    const res = await fetchImpl(`${baseUrl}${path}`, {
      method,
      credentials,
      headers: {
        accept: "application/json",
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
        ...extraHeaders,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const json = (await res.json().catch(() => null)) as
      | { data?: unknown; error?: string }
      | null;
    if (!res.ok) {
      const message =
        json?.error ?? `NotifyKit request failed: ${res.status} ${res.statusText}`;
      throw new Error(message);
    }
    return json?.data;
  }

  function reviveInbox(raw: unknown): InboxItem[] {
    if (!Array.isArray(raw)) return [];
    return raw.map(reviveInboxItem);
  }

  function reviveInboxItem(raw: unknown): InboxItem {
    const r = raw as Record<string, unknown>;
    return {
      id: String(r.id),
      notificationRecordId: String(r.notificationRecordId),
      recipientId: String(r.recipientId),
      notificationId: String(r.notificationId),
      title: String(r.title),
      body: typeof r.body === "string" ? r.body : undefined,
      actionUrl: typeof r.actionUrl === "string" ? r.actionUrl : undefined,
      readAt:
        typeof r.readAt === "string"
          ? new Date(r.readAt)
          : r.readAt === null
            ? null
            : null,
      createdAt: new Date(String(r.createdAt)),
    };
  }

  function revivePreferences(raw: unknown): RecipientPreference[] {
    if (!Array.isArray(raw)) return [];
    return raw.map(revivePreference);
  }

  function revivePreference(raw: unknown): RecipientPreference {
    const r = raw as Record<string, unknown>;
    return {
      recipientId: String(r.recipientId),
      notificationId: String(r.notificationId),
      channels: (r.channels ?? {}) as ChannelPreferenceMap,
      updatedAt: new Date(String(r.updatedAt)),
    };
  }

  return {
    getState() {
      return state;
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    inbox: {
      async list(): Promise<InboxItem[]> {
        setState({
          ...state,
          inbox: { ...state.inbox, status: "loading", error: null },
        });
        try {
          const items = reviveInbox(await request("GET", "/inbox"));
          setState({
            ...state,
            inbox: { items, status: "ready", error: null },
          });
          return items;
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          setState({
            ...state,
            inbox: { ...state.inbox, status: "error", error: message },
          });
          throw err;
        }
      },

      async markRead(inboxItemId: string): Promise<InboxItem | null> {
        // Optimistic: mark locally, then request; revert on failure.
        const prev = state.inbox.items;
        const optimistic = prev.map((it) =>
          it.id === inboxItemId && !it.readAt
            ? { ...it, readAt: new Date() }
            : it,
        );
        setState({
          ...state,
          inbox: { ...state.inbox, items: optimistic },
        });
        try {
          const raw = await request(
            "POST",
            `/inbox/${encodeURIComponent(inboxItemId)}/read`,
          );
          const updated = raw ? reviveInboxItem(raw) : null;
          if (updated) {
            const items = state.inbox.items.map((it) =>
              it.id === updated.id ? updated : it,
            );
            setState({
              ...state,
              inbox: { ...state.inbox, items },
            });
          }
          return updated;
        } catch (err) {
          setState({
            ...state,
            inbox: {
              ...state.inbox,
              items: prev,
              error: err instanceof Error ? err.message : String(err),
            },
          });
          throw err;
        }
      },
    },

    preferences: {
      async list(): Promise<RecipientPreference[]> {
        setState({
          ...state,
          preferences: { ...state.preferences, status: "loading", error: null },
        });
        try {
          const items = revivePreferences(await request("GET", "/preferences"));
          setState({
            ...state,
            preferences: { items, status: "ready", error: null },
          });
          return items;
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          setState({
            ...state,
            preferences: {
              ...state.preferences,
              status: "error",
              error: message,
            },
          });
          throw err;
        }
      },

      async update(input): Promise<RecipientPreference> {
        const prev = state.preferences.items;
        const existing = prev.find(
          (p) => p.notificationId === input.notificationId,
        );
        const optimistic: RecipientPreference = {
          recipientId: existing?.recipientId ?? "",
          notificationId: input.notificationId,
          channels: { ...(existing?.channels ?? {}), ...input.channels },
          updatedAt: new Date(),
        };
        const nextItems = existing
          ? prev.map((p) =>
              p.notificationId === input.notificationId ? optimistic : p,
            )
          : [...prev, optimistic];
        setState({
          ...state,
          preferences: { ...state.preferences, items: nextItems },
        });

        try {
          const raw = await request("POST", "/preferences", input);
          const updated = revivePreference(raw);
          const items = state.preferences.items.map((p) =>
            p.notificationId === updated.notificationId ? updated : p,
          );
          setState({
            ...state,
            preferences: {
              ...state.preferences,
              items,
              status: "ready",
              error: null,
            },
          });
          return updated;
        } catch (err) {
          setState({
            ...state,
            preferences: {
              ...state.preferences,
              items: prev,
              error: err instanceof Error ? err.message : String(err),
            },
          });
          throw err;
        }
      },
    },

    notifications: {
      async list(): Promise<NotificationMetadata[]> {
        const raw = await request("GET", "/notifications");
        if (!Array.isArray(raw)) return [];
        return raw as NotificationMetadata[];
      },
    },
  };
}
