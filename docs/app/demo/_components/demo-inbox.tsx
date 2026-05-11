"use client";

import { Inbox, NotificationBell, useInbox } from "@notifykitjs/react";

export function DemoInbox() {
  const { status, refresh } = useInbox();
  return (
    <div>
      <div style={{ marginBottom: "0.75rem" }}>
        <NotificationBell
          render={({ unreadCount }) => (
            <span>
              🔔{" "}
              {unreadCount > 0
                ? `${unreadCount} unread`
                : "Nothing unread"}
            </span>
          )}
        />{" "}
        <button type="button" onClick={() => void refresh()}>
          Refresh
        </button>
      </div>
      {status === "error" ? (
        <p style={{ color: "crimson" }}>Failed to load inbox.</p>
      ) : (
        <Inbox
          emptyState={
            <p style={{ color: "var(--fg-muted)" }}>
              Nothing yet — try a button above.
            </p>
          }
        />
      )}
    </div>
  );
}
