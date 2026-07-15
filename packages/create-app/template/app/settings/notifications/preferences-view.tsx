"use client";

import { useEffect, useState } from "react";
import { useNotifyKitClient, usePreferences } from "@notifykitjs/react";
import type { NotificationMetadata } from "@notifykitjs/react";

export function PreferencesView() {
  const client = useNotifyKitClient();
  const { status, error, update, isEnabled } = usePreferences();
  const [notifications, setNotifications] = useState<NotificationMetadata[]>([]);
  const [metadataStatus, setMetadataStatus] = useState<
    "loading" | "ready" | "error"
  >("loading");

  useEffect(() => {
    let cancelled = false;
    client.notifications
      .list()
      .then((result) => {
        if (cancelled) return;
        setNotifications(result);
        setMetadataStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setMetadataStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [client]);

  if (status === "error") {
    return <p style={{ color: "crimson" }}>Failed to load preferences: {error}</p>;
  }
  if (metadataStatus === "error") {
    return <p style={{ color: "crimson" }}>Failed to load notification definitions.</p>;
  }
  if (status === "loading" || metadataStatus === "loading") {
    return <p aria-live="polite">Loading preferences…</p>;
  }

  return (
    <table style={{ borderCollapse: "collapse", width: "100%" }}>
      <thead>
        <tr>
          <th style={cell}>Notification</th>
          <th style={cell}>Inbox</th>
          <th style={cell}>Email</th>
        </tr>
      </thead>
      <tbody>
        {notifications.map((n) => (
          <tr key={n.id}>
            <td style={cell}>
              <code>{n.id}</code>
            </td>
            {(["inbox", "email"] as const).map((ch) => (
              <td key={ch} style={cell}>
                {n.channels.includes(ch) ? (
                  <input
                    type="checkbox"
                    aria-label={`${n.id} ${ch}`}
                    checked={isEnabled(n.id, ch)}
                    onChange={(e) =>
                      void update({
                        notificationId: n.id,
                        channels: { [ch]: e.target.checked },
                      })
                    }
                  />
                ) : (
                  "—"
                )}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const cell = {
  border: "1px solid #ddd",
  padding: "0.5rem",
  textAlign: "left" as const,
};
