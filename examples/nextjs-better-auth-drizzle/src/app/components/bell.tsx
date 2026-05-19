"use client";

import { useInbox } from "@notifykitjs/react";

export function Bell({ onClick }: { onClick: () => void }) {
  const { unreadCount } = useInbox();

  return (
    <button className="bell" onClick={onClick} aria-label="Notifications">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>
      {unreadCount > 0 && <span className="bell-badge">{unreadCount}</span>}
    </button>
  );
}
