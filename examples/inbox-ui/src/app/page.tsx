"use client";

import { useEffect, useState } from "react";
import { Bell } from "./components/notification-bell";
import { InboxPanel } from "./components/inbox-panel";

export default function Home() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open]);

  return (
    <div className="app">
      <header className="app-header">
        <h1>My App</h1>
        <div className="header-right">
          <Bell onClick={() => setOpen(!open)} />
        </div>
      </header>

      {open && (
        <>
          <div className="inbox-backdrop" onClick={() => setOpen(false)} />
          <div className="inbox-overlay">
            <InboxPanel onClose={() => setOpen(false)} />
          </div>
        </>
      )}

      <main className="app-main">
        <h2>Dashboard</h2>
        <p>
          Click the bell icon in the top-right to open the notification inbox.
          This example uses <code>@notifykitjs/react</code> hooks to fetch and
          manage inbox items from the Next.js API route.
        </p>
        <p>
          Try marking items as read, archiving, or deleting them. The bell badge
          updates in real time.
        </p>
      </main>
    </div>
  );
}
