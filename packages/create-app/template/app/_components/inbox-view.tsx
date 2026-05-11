"use client";

import { Inbox, NotificationBell, useInbox } from "@notifykitjs/react";

export function InboxView() {
  const { status, refresh } = useInbox();
  return (
    <div>
      <div style={{ marginBottom: "0.5rem" }}>
        <NotificationBell
          render={({ unreadCount }) => (
            <span>
              🔔 {unreadCount > 0 ? `${unreadCount} unread` : "No unread"}
            </span>
          )}
        />{" "}
        <button type="button" onClick={() => refresh()}>
          Refresh
        </button>
      </div>
      {status === "error" ? (
        <p style={{ color: "crimson" }}>
          Failed to load inbox. Try signing in again.
        </p>
      ) : (
        <Inbox emptyState={<p>Nothing yet — send a test notification above.</p>} />
      )}
    </div>
  );
}
