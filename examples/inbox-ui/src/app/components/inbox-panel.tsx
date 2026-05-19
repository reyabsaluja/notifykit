"use client";

import { useInbox } from "@notifykitjs/react";

export function InboxPanel({ onClose }: { onClose: () => void }) {
  const { items, status, markRead, markAllRead, archive, deleteItem } = useInbox();

  return (
    <div className="inbox-panel">
      <div className="inbox-header">
        <h2>Notifications</h2>
        <div className="inbox-actions">
          <button onClick={() => markAllRead()} className="btn-text">
            Mark all read
          </button>
          <button onClick={onClose} className="btn-close" aria-label="Close">
            &times;
          </button>
        </div>
      </div>

      {status === "loading" && <div className="inbox-empty">Loading...</div>}

      {status === "ready" && items.length === 0 && (
        <div className="inbox-empty">All caught up.</div>
      )}

      <ul className="inbox-list">
        {items.map((item) => (
          <li
            key={item.id}
            className={`inbox-item ${item.readAt ? "read" : "unread"}`}
          >
            <div className="inbox-item-content">
              <strong className="inbox-item-title">{item.title}</strong>
              {item.body && <p className="inbox-item-body">{item.body}</p>}
              <time className="inbox-item-time">
                {new Date(item.createdAt).toLocaleString()}
              </time>
            </div>
            <div className="inbox-item-actions">
              {!item.readAt && (
                <button
                  onClick={() => markRead(item.id)}
                  className="btn-icon"
                  title="Mark read"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </button>
              )}
              <button
                onClick={() => archive(item.id)}
                className="btn-icon"
                title="Archive"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="21 8 21 21 3 21 3 8" />
                  <rect x="1" y="3" width="22" height="5" />
                </svg>
              </button>
              <button
                onClick={() => deleteItem(item.id)}
                className="btn-icon btn-danger"
                title="Delete"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
