"use client";

import { NotifyKitProvider } from "@notifykitjs/react";
import { useSession, signOut } from "@/lib/auth-client";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Bell } from "../components/bell";
import { InboxPanel } from "../components/inbox-panel";

export default function AppLayout({ children }: { children: ReactNode }) {
  const { data: session, isPending } = useSession();
  const router = useRouter();
  const [inboxOpen, setInboxOpen] = useState(false);

  useEffect(() => {
    if (!isPending && !session) {
      router.push("/login");
    }
  }, [session, isPending, router]);

  useEffect(() => {
    if (!inboxOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setInboxOpen(false);
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [inboxOpen]);

  if (isPending) return <div className="loading">Loading...</div>;
  if (!session) return null;

  return (
    <NotifyKitProvider options={{ baseUrl: "/api/notifykit" }}>
      <div className="app-shell">
        <header className="app-header">
          <h1>Acme</h1>
          <div className="header-right">
            <Bell onClick={() => setInboxOpen(!inboxOpen)} />
            <span className="user-name">{session.user.name}</span>
            <button onClick={() => signOut().then(() => router.push("/login"))} className="btn-signout">
              Sign out
            </button>
          </div>
        </header>
        {inboxOpen && (
          <>
            <div className="inbox-backdrop" onClick={() => setInboxOpen(false)} />
            <div className="inbox-overlay">
              <InboxPanel onClose={() => setInboxOpen(false)} />
            </div>
          </>
        )}
        <main className="app-content">{children}</main>
      </div>
    </NotifyKitProvider>
  );
}
