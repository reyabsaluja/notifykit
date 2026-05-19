"use client";

import { useInbox } from "@notifykitjs/react";

export function InboxPanel({ onClose }: { onClose: () => void }) {
  const { items, status, markRead, markAllRead, archive } = useInbox();

  return (
    <div className="inbox-panel">
      <div className="inbox-header">
        <h3>Notifications</h3>
        <div className="inbox-header-actions">
          <button onClick={() => markAllRead()} className="btn-sm">Mark all read</button>
          <button onClick={onClose} className="btn-close">&times;</button>
        </div>
      </div>

      {status === "loading" && <p className="inbox-empty">Loading...</p>}
      {status === "ready" && items.length === 0 && (
        <p className="inbox-empty">No notifications yet.</p>
      )}

      <ul className="inbox-list">
        {items.map((item) => (
          <li key={item.id} className={`inbox-item ${item.readAt ? "read" : ""}`}>
            <div className="inbox-item-body">
              <strong>{item.title}</strong>
              {item.body && <p>{item.body}</p>}
              <time>{new Date(item.createdAt).toLocaleString()}</time>
            </div>
            <div className="inbox-item-actions">
              {!item.readAt && (
                <button onClick={() => markRead(item.id)} title="Mark read">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </button>
              )}
              <button onClick={() => archive(item.id)} title="Archive">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="21 8 21 21 3 21 3 8" />
                  <rect x="1" y="3" width="22" height="5" />
                </svg>
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
