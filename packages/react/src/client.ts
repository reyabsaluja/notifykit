import type {
  ChannelPreferenceMap,
  InboxItem,
  NotificationClassification,
  RecipientPreference,
} from "@notifykitjs/core";

export type ClientStatus = "idle" | "loading" | "ready" | "error";

export type NotificationMetadata = {
  id: string;
  channels: string[];
  payload: Record<string, string>;
  description?: string;
  category?: string;
  version?: number;
  required?: boolean;
  defaultChannels?: ChannelPreferenceMap;
  classification?: NotificationClassification;
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
  /**
   * Called when the SSE connection encounters an error during
   * reconnect. Useful for logging or diagnostics in production.
   */
  onRealtimeError?: (error: unknown) => void;
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
    getGlobal(): Promise<RecipientPreference | null>;
    updateGlobal(input: {
      channels: ChannelPreferenceMap;
    }): Promise<RecipientPreference>;
    getCategory(category: string): Promise<RecipientPreference | null>;
    listCategories(): Promise<RecipientPreference[]>;
    updateCategory(input: {
      category: string;
      channels: ChannelPreferenceMap;
    }): Promise<RecipientPreference>;
  };
  notifications: {
    list(): Promise<NotificationMetadata[]>;
  };
};

function cloneOptionalDate<T extends Date | null | undefined>(value: T): T {
  return (value instanceof Date ? new Date(value.getTime()) : value) as T;
}

function cloneInboxItem(item: InboxItem): InboxItem {
  return {
    ...item,
    readAt: cloneOptionalDate(item.readAt),
    archivedAt: cloneOptionalDate(item.archivedAt),
    createdAt: new Date(item.createdAt.getTime()),
  };
}

function clonePreference(preference: RecipientPreference): RecipientPreference {
  return {
    ...preference,
    channels: { ...preference.channels },
    updatedAt: new Date(preference.updatedAt.getTime()),
  };
}

function cloneState(state: ClientState): ClientState {
  return {
    inbox: {
      ...state.inbox,
      items: state.inbox.items.map(cloneInboxItem),
    },
    preferences: {
      ...state.preferences,
      items: state.preferences.items.map(clonePreference),
    },
  };
}

function cloneMetadata(item: NotificationMetadata): NotificationMetadata {
  const cloned: NotificationMetadata = {
    ...item,
    channels: item.channels.slice(),
    payload: { ...item.payload },
  };
  if (item.defaultChannels !== undefined) {
    cloned.defaultChannels = { ...item.defaultChannels };
  }
  return cloned;
}

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
  const onRealtimeError = options.onRealtimeError;

  let state: ClientState = {
    inbox: { items: [], unreadCount: 0, status: "idle", error: null },
    preferences: { items: [], status: "idle", error: null },
  };
  const listeners = new Set<() => void>();

  function setState(next: ClientState) {
    state = next;
    for (const l of listeners) {
      try {
        l();
      } catch (err) {
        console.error("[notifykit] client listener error:", err);
      }
    }
  }

  let sseAbort: AbortController | null = null;
  let rtStatus: RealtimeStatus = "disconnected";
  let connectRefCount = 0;
  let lastEventId = "";
  let authFailed = false;

  function handleRealtimeData(data: string) {
    let event: {
      type: string;
      item?: Record<string, unknown>;
      itemId?: string;
      count?: number;
    };
    try {
      event = JSON.parse(data);
    } catch (err) {
      onRealtimeError?.(err);
      return;
    }
    try {
      applyRealtimeEvent(event);
    } catch (err) {
      onRealtimeError?.(err);
    }
  }

  function applyRealtimeEvent(event: {
    type?: string;
    item?: unknown;
    itemId?: string;
    count?: number;
  }) {
    const prev = state.inbox;

    if (event.type === "inbox.created" && event.item) {
      const item = reviveInboxItem(event.item);
      const exists = prev.items.some((it) => it.id === item.id);
      if (!exists) {
        const items = [item, ...prev.items];
        const unread = isActiveUnread(item) ? 1 : 0;
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
      if (old && isActiveUnread(old) && !isActiveUnread(item)) delta = -1;
      if (old && !isActiveUnread(old) && isActiveUnread(item)) delta = 1;
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
        const unread = isActiveUnread(item) ? 1 : 0;
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
    } else if (event.type === "inbox.refetch") {
      request("GET", "/inbox")
        .then((raw) => {
          const fetched = reviveInbox(raw);
          const fetchedIds = new Set(fetched.map((it) => it.id));
          const current = state.inbox.items;
          const extras = recentUnfetchedExtras(current, fetchedIds, false);
          const items = [...extras, ...fetched];
          const unreadCount = items.filter(isActiveUnread).length;
          setState({
            ...state,
            inbox: { ...state.inbox, items, unreadCount },
          });
        })
        .catch(() => {});
    } else if (event.type === "inbox.all_read") {
      const now = new Date();
      const items = prev.items.map((it) =>
        isActiveUnread(it) ? { ...it, readAt: now } : it,
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

  async function readSSEStream(signal: AbortSignal, onOpen?: () => void) {
    const url = `${baseUrl}/inbox/stream`;
    const sseHeaders: Record<string, string> = {
      accept: "text/event-stream",
      ...extraHeaders,
    };
    if (lastEventId) {
      sseHeaders["last-event-id"] = lastEventId;
    }
    const res = await fetchImpl(url, {
      method: "GET",
      credentials,
      headers: sseHeaders,
      signal,
    });
    if (!res.ok || !res.body) {
      const err = new Error(`SSE connect failed: ${res.status}`);
      (err as any).status = res.status;
      throw err;
    }
    setRtStatus("connected");
    onOpen?.();
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    function processSSEPart(part: string) {
      const dataLines: string[] = [];
      for (const line of part.split(/\r\n|\n|\r/)) {
        if (line.startsWith("data: ")) {
          dataLines.push(line.slice(6));
        } else if (line === "data:") {
          dataLines.push("");
        } else if (line.startsWith("id: ")) {
          lastEventId = line.slice(4);
        } else if (line.startsWith("id:")) {
          lastEventId = line.slice(3);
        }
      }
      if (dataLines.length > 0) handleRealtimeData(dataLines.join("\n"));
    }
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        buffer += decoder.decode();
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split(/\r\n\r\n|\n\n|\r\r/);
      buffer = parts.pop()!;
      for (const part of parts) {
        processSSEPart(part);
      }
    }
    if (buffer.trim()) {
      processSSEPart(buffer);
    }
  }

  function openConnection() {
    setRtStatus("connecting");
    const controller = new AbortController();
    sseAbort = controller;
    (async () => {
      let retryMs = 1000;
      let retries = 0;
      let wasError = false;
      let hasConnectedBefore = false;
      const MAX_RETRIES = 20;
      while (!controller.signal.aborted) {
        if (hasConnectedBefore) {
          applyRealtimeEvent({ type: "inbox.refetch" });
        }
        const connStart = Date.now();
        try {
          await readSSEStream(controller.signal, () => {
            hasConnectedBefore = true;
          });
          const streamDuration = Date.now() - connStart;
          if (streamDuration > 5000) {
            retries = 0;
            retryMs = 1000;
            wasError = false;
          } else {
            retries++;
            wasError = true;
          }
        } catch (err) {
          if (controller.signal.aborted) break;
          const status = (err as any)?.status;
          if (status === 401 || status === 403) {
            authFailed = true;
            onRealtimeError?.(err);
            setRtStatus("disconnected");
            break;
          }
          retries++;
          wasError = true;
          onRealtimeError?.(err);
        }
        if (retries >= MAX_RETRIES) {
          setRtStatus("disconnected");
          break;
        }
        if (controller.signal.aborted) break;
        setRtStatus("connecting");
        const jitteredDelay = retryMs * (0.5 + Math.random() * 0.5);
        await new Promise((r) => {
          const timer = setTimeout(r, jitteredDelay);
          controller.signal.addEventListener("abort", () => { clearTimeout(timer); r(undefined); }, { once: true });
        });
        if (controller.signal.aborted) break;
        if (wasError) retryMs = Math.min(retryMs * 2, 30_000);
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
    if (authFailed) return;
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
    if (!res.ok) {
      const errJson = (await res.json().catch(() => null)) as
        | { error?: string }
        | null;
      const message =
        errJson?.error ?? `NotifyKit request failed: ${res.status} ${res.statusText}`;
      throw new Error(message);
    }
    const json = (await res.json()) as { data?: unknown };
    return json?.data;
  }

  function isActiveUnread(item: InboxItem): boolean {
    return !item.readAt && !item.archivedAt;
  }

  function recentUnfetchedExtras(
    current: InboxItem[],
    fetchedIds: Set<string>,
    archived: boolean,
  ): InboxItem[] {
    const now = Date.now();
    return current.filter(
      (it) =>
        !fetchedIds.has(it.id) &&
        now - it.createdAt.getTime() < 10_000 &&
        (it.archivedAt != null) === archived,
    );
  }

  function reviveInbox(raw: unknown): InboxItem[] {
    if (!Array.isArray(raw)) return [];
    return raw.filter((item) => item && typeof item === "object" && typeof (item as Record<string, unknown>).id === "string").map(reviveInboxItem);
  }

  function reviveInboxItem(raw: unknown): InboxItem {
    if (!raw || typeof raw !== "object") {
      throw new Error("Invalid inbox item: expected an object");
    }
    const r = raw as Record<string, unknown>;
    if (typeof r.id !== "string" || typeof r.recipientId !== "string") {
      throw new Error("Invalid inbox item: missing required fields");
    }
    return {
      id: r.id,
      notificationRecordId: typeof r.notificationRecordId === "string" ? r.notificationRecordId : "",
      recipientId: r.recipientId,
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
    return raw.filter(isValidPreference).map(revivePreference);
  }

  function isValidPreference(raw: unknown): boolean {
    if (!raw || typeof raw !== "object") return false;
    const r = raw as Record<string, unknown>;
    return typeof r.recipientId === "string" && typeof r.notificationId === "string";
  }

  function revivePreference(raw: unknown): RecipientPreference {
    const r = raw as Record<string, unknown>;
    const channels =
      r.channels && typeof r.channels === "object" && !Array.isArray(r.channels)
        ? (r.channels as ChannelPreferenceMap)
        : {};
    return {
      recipientId: String(r.recipientId),
      tenantId: typeof r.tenantId === "string" ? r.tenantId : undefined,
      workspaceId:
        typeof r.workspaceId === "string" ? r.workspaceId : undefined,
      notificationId: String(r.notificationId),
      channels,
      updatedAt: new Date(String(r.updatedAt)),
    };
  }

  return {
    getState() {
      return cloneState(state);
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
          const fetched = reviveInbox(await request("GET", `/inbox${qs}`));
          const fetchedIds = new Set(fetched.map((it) => it.id));
          const current = state.inbox.items;
          const archived = options?.archived === true;
          const extras = recentUnfetchedExtras(current, fetchedIds, archived);
          const items = [...extras, ...fetched];
          const unreadCount = options?.archived
            ? state.inbox.unreadCount
            : items.filter(isActiveUnread).length;
          setState({
            ...state,
            inbox: { items, unreadCount, status: "ready", error: null },
          });
          return items.map(cloneInboxItem);
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
        const prevItems = state.inbox.items;
        const target = prevItems.find((it) => it.id === inboxItemId);
        const wasUnread = target && isActiveUnread(target);
        const prevUnreadCount = state.inbox.unreadCount;
        setState({
          ...state,
          inbox: {
            ...state.inbox,
            items: prevItems.map((it) =>
              it.id === inboxItemId && !it.readAt
                ? { ...it, readAt: new Date() }
                : it,
            ),
            unreadCount: wasUnread ? Math.max(0, prevUnreadCount - 1) : prevUnreadCount,
          },
        });
        try {
          const raw = await request(
            "POST",
            `/inbox/${encodeURIComponent(inboxItemId)}/read`,
          );
          const updated = raw ? reviveInboxItem(raw) : null;
          if (updated) {
            setState({
              ...state,
              inbox: {
                ...state.inbox,
                items: state.inbox.items.map((it) =>
                  it.id === updated.id ? updated : it,
                ),
              },
            });
          }
          return updated ? cloneInboxItem(updated) : null;
        } catch (err) {
          const originalReadAt = prevItems.find((it) => it.id === inboxItemId)?.readAt ?? null;
          setState({
            ...state,
            inbox: {
              ...state.inbox,
              items: state.inbox.items.map((it) =>
                it.id === inboxItemId ? { ...it, readAt: originalReadAt } : it,
              ),
              unreadCount: wasUnread ? prevUnreadCount : state.inbox.unreadCount,
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
        const prevUnread = state.inbox.unreadCount;
        const readAtSnapshot = new Map<string, Date | null | undefined>();
        for (const it of state.inbox.items) {
          if (isActiveUnread(it)) readAtSnapshot.set(it.id, it.readAt);
        }
        const now = new Date();
        setState({
          ...state,
          inbox: {
            ...state.inbox,
            items: state.inbox.items.map((it) =>
              isActiveUnread(it) ? { ...it, readAt: now } : it,
            ),
            unreadCount: 0,
          },
        });
        try {
          const raw = (await request("POST", "/inbox/mark-all-read")) as {
            count?: number;
          };
          return raw?.count ?? 0;
        } catch (err) {
          const rolledBackItems = state.inbox.items.map((it) =>
            readAtSnapshot.has(it.id) ? { ...it, readAt: readAtSnapshot.get(it.id) ?? null } : it,
          );
          setState({
            ...state,
            inbox: {
              ...state.inbox,
              items: rolledBackItems,
              unreadCount: prevUnread,
              error: err instanceof Error ? err.message : String(err),
            },
          });
          throw err;
        }
      },

      async archive(inboxItemId: string): Promise<InboxItem | null> {
        const prevItems = state.inbox.items;
        const target = prevItems.find((it) => it.id === inboxItemId);
        const alreadyArchived = target?.archivedAt != null;
        const shouldDecrementCount = target && isActiveUnread(target);
        const prevUnreadCount = state.inbox.unreadCount;
        setState({
          ...state,
          inbox: {
            ...state.inbox,
            items: alreadyArchived
              ? prevItems
              : prevItems.filter((it) => it.id !== inboxItemId),
            unreadCount: shouldDecrementCount
              ? Math.max(0, prevUnreadCount - 1)
              : prevUnreadCount,
          },
        });
        try {
          const raw = await request(
            "POST",
            `/inbox/${encodeURIComponent(inboxItemId)}/archive`,
          );
          const updated = raw ? reviveInboxItem(raw) : null;
          return updated ? cloneInboxItem(updated) : null;
        } catch (err) {
          if (target && !alreadyArchived) {
            const current = state.inbox.items;
            const exists = current.some((it) => it.id === inboxItemId);
            setState({
              ...state,
              inbox: {
                ...state.inbox,
                items: exists ? current : [target, ...current],
                unreadCount: shouldDecrementCount ? prevUnreadCount : state.inbox.unreadCount,
                error: err instanceof Error ? err.message : String(err),
              },
            });
          }
          throw err;
        }
      },

      async unarchive(inboxItemId: string): Promise<InboxItem | null> {
        const prevItems = state.inbox.items;
        const target = prevItems.find((it) => it.id === inboxItemId);
        const alreadyUnarchived = target != null && target.archivedAt == null;
        const shouldIncrementCount =
          target && !target.readAt && target.archivedAt != null;
        const prevUnreadCount = state.inbox.unreadCount;
        setState({
          ...state,
          inbox: {
            ...state.inbox,
            items: alreadyUnarchived
              ? prevItems
              : prevItems.filter((it) => it.id !== inboxItemId),
            unreadCount: shouldIncrementCount
              ? prevUnreadCount + 1
              : prevUnreadCount,
          },
        });
        try {
          const raw = await request(
            "POST",
            `/inbox/${encodeURIComponent(inboxItemId)}/unarchive`,
          );
          const updated = raw ? reviveInboxItem(raw) : null;
          return updated ? cloneInboxItem(updated) : null;
        } catch (err) {
          if (target && !alreadyUnarchived) {
            const current = state.inbox.items;
            const exists = current.some((it) => it.id === inboxItemId);
            setState({
              ...state,
              inbox: {
                ...state.inbox,
                items: exists ? current : [target, ...current],
                unreadCount: shouldIncrementCount ? prevUnreadCount : state.inbox.unreadCount,
                error: err instanceof Error ? err.message : String(err),
              },
            });
          }
          throw err;
        }
      },

      async deleteItem(inboxItemId: string): Promise<void> {
        const prevItems = state.inbox.items;
        const target = prevItems.find((it) => it.id === inboxItemId);
        const wasUnread = target && isActiveUnread(target);
        const prevUnreadCount = state.inbox.unreadCount;
        setState({
          ...state,
          inbox: {
            ...state.inbox,
            items: prevItems.filter((it) => it.id !== inboxItemId),
            unreadCount: wasUnread ? Math.max(0, prevUnreadCount - 1) : prevUnreadCount,
          },
        });
        try {
          await request(
            "DELETE",
            `/inbox/${encodeURIComponent(inboxItemId)}`,
          );
        } catch (err) {
          if (target) {
            const current = state.inbox.items;
            const exists = current.some((it) => it.id === inboxItemId);
            setState({
              ...state,
              inbox: {
                ...state.inbox,
                items: exists ? current : [target, ...current],
                unreadCount: wasUnread ? prevUnreadCount : state.inbox.unreadCount,
                error: err instanceof Error ? err.message : String(err),
              },
            });
          }
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
          return items.map(clonePreference);
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
        const existing = state.preferences.items.find(
          (p) => p.notificationId === input.notificationId,
        );
        const prevChannels = existing ? { ...existing.channels } : null;
        const wasNew = !existing;
        const optimistic: RecipientPreference = {
          recipientId: existing?.recipientId ?? "",
          notificationId: input.notificationId,
          channels: { ...(existing?.channels ?? {}), ...input.channels },
          updatedAt: new Date(),
        };
        setState({
          ...state,
          preferences: {
            ...state.preferences,
            items: existing
              ? state.preferences.items.map((p) =>
                  p.notificationId === input.notificationId ? optimistic : p,
                )
              : [...state.preferences.items, optimistic],
          },
        });

        try {
          const raw = await request("POST", "/preferences", input);
          const updated = revivePreference(raw);
          setState({
            ...state,
            preferences: {
              ...state.preferences,
              items: state.preferences.items.map((p) =>
                p.notificationId === updated.notificationId ? updated : p,
              ),
              status: "ready",
              error: null,
            },
          });
          return clonePreference(updated);
        } catch (err) {
          setState({
            ...state,
            preferences: {
              ...state.preferences,
              items: wasNew
                ? state.preferences.items.filter(
                    (p) => p.notificationId !== input.notificationId,
                  )
                : state.preferences.items.map((p) =>
                    p.notificationId === input.notificationId && prevChannels
                      ? { ...p, channels: prevChannels }
                      : p,
                  ),
              error: err instanceof Error ? err.message : String(err),
            },
          });
          throw err;
        }
      },

      async getGlobal(): Promise<RecipientPreference | null> {
        const raw = await request("GET", "/preferences/global");
        const preference = raw ? revivePreference(raw) : null;
        return preference ? clonePreference(preference) : null;
      },

      async updateGlobal(input): Promise<RecipientPreference> {
        const raw = await request("POST", "/preferences/global", input);
        return clonePreference(revivePreference(raw));
      },

      async getCategory(category): Promise<RecipientPreference | null> {
        const raw = await request(
          "GET",
          `/preferences/category?category=${encodeURIComponent(category)}`,
        );
        const preference = raw ? revivePreference(raw) : null;
        return preference ? clonePreference(preference) : null;
      },

      async listCategories(): Promise<RecipientPreference[]> {
        return revivePreferences(await request("GET", "/preferences/categories"))
          .map(clonePreference);
      },

      async updateCategory(input): Promise<RecipientPreference> {
        const raw = await request("POST", "/preferences/category", input);
        return clonePreference(revivePreference(raw));
      },
    },

    notifications: {
      async list(): Promise<NotificationMetadata[]> {
        const raw = await request("GET", "/notifications");
        if (!Array.isArray(raw)) return [];
        return raw.filter(
          (item): item is NotificationMetadata =>
            item != null &&
            typeof item === "object" &&
            typeof (item as Record<string, unknown>).id === "string" &&
            Array.isArray((item as Record<string, unknown>).channels),
        ).map(cloneMetadata);
      },
    },
  };
}
