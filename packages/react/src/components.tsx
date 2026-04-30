import type { InboxItem } from "notifykit";
import type { ReactNode } from "react";
import { useInbox } from "./hooks.js";

export type NotificationBellProps = {
  /** Custom renderer. Default shows a plain "(N)" badge. */
  render?: (props: { unreadCount: number }) => ReactNode;
};

export function NotificationBell({ render }: NotificationBellProps) {
  const { unreadCount } = useInbox();
  if (render) return <>{render({ unreadCount })}</>;
  return (
    <span aria-label={`${unreadCount} unread notifications`}>
      {unreadCount > 0 ? `(${unreadCount})` : ""}
    </span>
  );
}

export type InboxProps = {
  /** Custom renderer for a single item. Default shows title + body. */
  renderItem?: (props: {
    item: InboxItem;
    markRead: (id: string) => Promise<InboxItem | null>;
  }) => ReactNode;
  emptyState?: ReactNode;
};

export function Inbox({ renderItem, emptyState }: InboxProps) {
  const { items, status, markRead } = useInbox();

  if (status === "loading" && items.length === 0) {
    return <div>Loading…</div>;
  }
  if (status === "error") {
    return <div>Failed to load inbox.</div>;
  }
  if (items.length === 0) {
    return <>{emptyState ?? <div>Nothing here yet.</div>}</>;
  }

  return (
    <ul>
      {items.map((item) => (
        <li key={item.id} data-read={item.readAt ? "true" : "false"}>
          {renderItem ? (
            renderItem({ item, markRead })
          ) : (
            <DefaultInboxRow item={item} markRead={markRead} />
          )}
        </li>
      ))}
    </ul>
  );
}

function DefaultInboxRow({
  item,
  markRead,
}: {
  item: InboxItem;
  markRead: (id: string) => Promise<InboxItem | null>;
}) {
  return (
    <div>
      <strong>{item.title}</strong>
      {item.body ? <div>{item.body}</div> : null}
      {item.actionUrl ? (
        <a href={item.actionUrl}>Open</a>
      ) : null}
      {!item.readAt ? (
        <button type="button" onClick={() => void markRead(item.id)}>
          Mark read
        </button>
      ) : null}
    </div>
  );
}
