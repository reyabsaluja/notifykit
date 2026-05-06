"use client";

import { useEffect, useState } from "react";
import { useNotifyKitClient, usePreferences } from "notifykit-react";
import type { NotificationMetadata } from "notifykit-react";

export function PreferencesView() {
  const client = useNotifyKitClient();
  const { status, error, update, isEnabled } = usePreferences();
  const [notifications, setNotifications] = useState<NotificationMetadata[]>([]);

  useEffect(() => {
    client.notifications.list().then(setNotifications).catch(() => {});
  }, [client]);

  if (status === "error") {
    return <p style={{ color: "crimson" }}>Failed to load preferences: {error}</p>;
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
