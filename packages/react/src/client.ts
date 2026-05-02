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
  description?: string;
  category?: string;
  version?: number;
};

export type ClientState = {
  inbox: {
    items: InboxItem[];
    unreadCount: number;
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
  /**
   * Enable realtime updates via SSE. When `true`, calling `connect()`
   * opens an EventSource to `/inbox/stream` and merges events into state.
   */
  realtime?: boolean;
};

export type RealtimeStatus = "disconnected" | "connecting" | "connected";

export type NotifyKitClient = {
  getState(): ClientState;
  subscribe(listener: () => void): () => void;
  /**
   * Open an SSE connection to receive live inbox updates. No-op if already
   * connected or if `realtime` was not enabled in options. The connection
   * auto-reconnects on failure via EventSource semantics.
   */
  connect(): void;
  /** Close the SSE connection. Safe to call when already disconnected. */
  disconnect(): void;
  /** Current SSE connection status. */
  realtimeStatus(): RealtimeStatus;
  inbox: {
    list(options?: { archived?: boolean }): Promise<InboxItem[]>;
    markRead(inboxItemId: string): Promise<InboxItem | null>;
    unreadCount(): Promise<number>;
    markAllRead(): Promise<number>;
    archive(inboxItemId: string): Promise<InboxItem | null>;
    unarchive(inboxItemId: string): Promise<InboxItem | null>;
    deleteItem(inboxItemId: string): Promise<void>;
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
  const realtimeEnabled = options.realtime ?? false;

  let state: ClientState = {
    inbox: { items: [], unreadCount: 0, status: "idle", error: null },
    preferences: { items: [], status: "idle", error: null },
  };
  const listeners = new Set<() => void>();

  function setState(next: ClientState) {
    state = next;
    for (const l of listeners) l();
  }

  let sseAbort: AbortController | null = null;
  let rtStatus: RealtimeStatus = "disconnected";
  let connectRefCount = 0;

  function handleRealtimeData(data: string) {
    let event: {
      type: string;
      item?: Record<string, unknown>;
      itemId?: string;
      count?: number;
    };
    try {
      event = JSON.parse(data);
    } catch {
      return;
    }
    const prev = state.inbox;

    if (event.type === "inbox.created" && event.item) {
      const item = reviveInboxItem(event.item);
      const exists = prev.items.some((it) => it.id === item.id);
      if (!exists) {
        const items = [item, ...prev.items];
        const unread = item.readAt ? 0 : 1;
        setState({
          ...state,
          inbox: {
            ...prev,
            items,
            unreadCount: prev.unreadCount + unread,
          },
        });
      }
    } else if (event.type === "inbox.updated" && event.item) {
      const item = reviveInboxItem(event.item);
      const old = prev.items.find((it) => it.id === item.id);
      const items = prev.items.map((it) => (it.id === item.id ? item : it));
      let delta = 0;
      if (old && !old.readAt && item.readAt) delta = -1;
      if (old && old.readAt && !item.readAt) delta = 1;
      setState({
        ...state,
        inbox: {
          ...prev,
          items,
          unreadCount: Math.max(0, prev.unreadCount + delta),
        },
      });
    } else if (event.type === "inbox.archived" && event.item) {
      const item = reviveInboxItem(event.item);
      const old = prev.items.find((it) => it.id === item.id);
      const wasUnread = old && !old.readAt && !old.archivedAt;
      const items = prev.items.filter((it) => it.id !== item.id);
      setState({
        ...state,
        inbox: {
          ...prev,
          items,
          unreadCount: wasUnread
            ? Math.max(0, prev.unreadCount - 1)
            : prev.unreadCount,
        },
      });
    } else if (event.type === "inbox.unarchived" && event.item) {
      const item = reviveInboxItem(event.item);
      const exists = prev.items.some((it) => it.id === item.id);
      if (!exists) {
        const items = [item, ...prev.items];
        const unread = !item.readAt ? 1 : 0;
        setState({
          ...state,
          inbox: {
            ...prev,
            items,
            unreadCount: prev.unreadCount + unread,
          },
        });
      }
    } else if (event.type === "inbox.deleted" && event.itemId) {
      const target = prev.items.find((it) => it.id === event.itemId);
      const wasUnread = target && !target.readAt && !target.archivedAt;
      const items = prev.items.filter((it) => it.id !== event.itemId);
      setState({
        ...state,
        inbox: {
          ...prev,
          items,
          unreadCount: wasUnread
            ? Math.max(0, prev.unreadCount - 1)
            : prev.unreadCount,
        },
      });
    } else if (event.type === "inbox.all_read") {
      const now = new Date();
      const items = prev.items.map((it) =>
        !it.readAt ? { ...it, readAt: now } : it,
      );
      setState({
        ...state,
        inbox: { ...prev, items, unreadCount: 0 },
      });
    }
  }

  function setRtStatus(next: RealtimeStatus) {
    if (rtStatus === next) return;
    rtStatus = next;
    for (const l of listeners) l();
  }

  async function readSSEStream(signal: AbortSignal) {
    const url = `${baseUrl}/inbox/stream`;
    const res = await fetchImpl(url, {
      method: "GET",
      credentials,
      headers: {
        accept: "text/event-stream",
        ...extraHeaders,
      },
      signal,
    });
    if (!res.ok || !res.body) {
      throw new Error(`SSE connect failed: ${res.status}`);
    }
    setRtStatus("connected");
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split("\n\n");
      buffer = parts.pop()!;
      for (const part of parts) {
        let data: string | undefined;
        for (const line of part.split("\n")) {
          if (line.startsWith("data: ")) {
            data = line.slice(6);
          }
        }
        if (data) handleRealtimeData(data);
      }
    }
  }

  function openConnection() {
    setRtStatus("connecting");
    const controller = new AbortController();
    sseAbort = controller;
    (async () => {
      let retryMs = 1000;
      while (!controller.signal.aborted) {
        try {
          await readSSEStream(controller.signal);
        } catch {
          if (controller.signal.aborted) break;
        }
        setRtStatus("connecting");
        await new Promise((r) => setTimeout(r, retryMs));
        retryMs = Math.min(retryMs * 2, 30_000);
      }
    })();
  }

  function closeConnection() {
    if (sseAbort) {
      sseAbort.abort();
      sseAbort = null;
    }
    setRtStatus("disconnected");
  }

  function connect() {
    if (!realtimeEnabled) return;
    connectRefCount++;
    if (connectRefCount === 1) openConnection();
  }

  function disconnect() {
    if (!realtimeEnabled) return;
    connectRefCount = Math.max(0, connectRefCount - 1);
    if (connectRefCount === 0) closeConnection();
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
      tenantId: typeof r.tenantId === "string" ? r.tenantId : undefined,
      workspaceId:
        typeof r.workspaceId === "string" ? r.workspaceId : undefined,
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
      archivedAt:
        typeof r.archivedAt === "string"
          ? new Date(r.archivedAt)
          : r.archivedAt === null
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
      tenantId: typeof r.tenantId === "string" ? r.tenantId : undefined,
      workspaceId:
        typeof r.workspaceId === "string" ? r.workspaceId : undefined,
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

    connect,
    disconnect,
    realtimeStatus() {
      return rtStatus;
    },

    inbox: {
      async list(options?: { archived?: boolean }): Promise<InboxItem[]> {
        setState({
          ...state,
          inbox: { ...state.inbox, status: "loading", error: null },
        });
        try {
          const qs = options?.archived ? "?archived=true" : "";
          const items = reviveInbox(await request("GET", `/inbox${qs}`));
          const unreadCount = options?.archived
            ? state.inbox.unreadCount
            : items.filter((it) => !it.readAt).length;
          setState({
            ...state,
            inbox: { items, unreadCount, status: "ready", error: null },
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
        const prev = state.inbox;
        const target = prev.items.find((it) => it.id === inboxItemId);
        const wasUnread = target && !target.readAt && !target.archivedAt;
        const optimistic = prev.items.map((it) =>
          it.id === inboxItemId && !it.readAt
            ? { ...it, readAt: new Date() }
            : it,
        );
        setState({
          ...state,
          inbox: {
            ...state.inbox,
            items: optimistic,
            unreadCount: wasUnread ? prev.unreadCount - 1 : prev.unreadCount,
          },
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
              ...prev,
              error: err instanceof Error ? err.message : String(err),
            },
          });
          throw err;
        }
      },

      async unreadCount(): Promise<number> {
        const raw = (await request("GET", "/inbox/unread-count")) as {
          count?: number;
        };
        const count = raw?.count ?? 0;
        setState({
          ...state,
          inbox: { ...state.inbox, unreadCount: count },
        });
        return count;
      },

      async markAllRead(): Promise<number> {
        const prev = state.inbox;
        const now = new Date();
        const optimistic = prev.items.map((it) =>
          !it.readAt && !it.archivedAt ? { ...it, readAt: now } : it,
        );
        setState({
          ...state,
          inbox: { ...state.inbox, items: optimistic, unreadCount: 0 },
        });
        try {
          const raw = (await request("POST", "/inbox/mark-all-read")) as {
            count?: number;
          };
          return raw?.count ?? 0;
        } catch (err) {
          setState({
            ...state,
            inbox: {
              ...prev,
              error: err instanceof Error ? err.message : String(err),
            },
          });
          throw err;
        }
      },

      async archive(inboxItemId: string): Promise<InboxItem | null> {
        const prev = state.inbox;
        const target = prev.items.find((it) => it.id === inboxItemId);
        const alreadyArchived = target?.archivedAt != null;
        const shouldDecrementCount = target && !target.readAt && !alreadyArchived;
        const optimistic = alreadyArchived
          ? prev.items
          : prev.items.filter((it) => it.id !== inboxItemId);
        setState({
          ...state,
          inbox: {
            ...state.inbox,
            items: optimistic,
            unreadCount: shouldDecrementCount
              ? prev.unreadCount - 1
              : prev.unreadCount,
          },
        });
        try {
          const raw = await request(
            "POST",
            `/inbox/${encodeURIComponent(inboxItemId)}/archive`,
          );
          return raw ? reviveInboxItem(raw) : null;
        } catch (err) {
          setState({
            ...state,
            inbox: {
              ...prev,
              error: err instanceof Error ? err.message : String(err),
            },
          });
          throw err;
        }
      },

      async unarchive(inboxItemId: string): Promise<InboxItem | null> {
        const prev = state.inbox;
        const target = prev.items.find((it) => it.id === inboxItemId);
        const alreadyUnarchived = target != null && target.archivedAt == null;
        const shouldIncrementCount =
          target && !target.readAt && !alreadyUnarchived;
        const optimistic = alreadyUnarchived
          ? prev.items
          : prev.items.filter((it) => it.id !== inboxItemId);
        setState({
          ...state,
          inbox: {
            ...state.inbox,
            items: optimistic,
            unreadCount: shouldIncrementCount
              ? prev.unreadCount + 1
              : prev.unreadCount,
          },
        });
        try {
          const raw = await request(
            "POST",
            `/inbox/${encodeURIComponent(inboxItemId)}/unarchive`,
          );
          return raw ? reviveInboxItem(raw) : null;
        } catch (err) {
          setState({
            ...state,
            inbox: {
              ...prev,
              error: err instanceof Error ? err.message : String(err),
            },
          });
          throw err;
        }
      },

      async deleteItem(inboxItemId: string): Promise<void> {
        const prev = state.inbox;
        const target = prev.items.find((it) => it.id === inboxItemId);
        const wasUnread = target && !target.readAt && !target.archivedAt;
        const optimistic = prev.items.filter((it) => it.id !== inboxItemId);
        setState({
          ...state,
          inbox: {
            ...state.inbox,
            items: optimistic,
            unreadCount: wasUnread ? prev.unreadCount - 1 : prev.unreadCount,
          },
        });
        try {
          await request(
            "DELETE",
            `/inbox/${encodeURIComponent(inboxItemId)}`,
          );
        } catch (err) {
          setState({
            ...state,
            inbox: {
              ...prev,
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
