"use client";

import { usePreferences } from "@notifykitjs/react";

const CHANNEL_LABELS: Record<string, string> = {
  inbox: "In-app",
  email: "Email",
};

export default function SettingsPage() {
  const { items, status, update } = usePreferences();

  return (
    <div className="settings">
      <h2>Notification preferences</h2>
      <p className="settings-desc">
        Choose which channels to receive notifications on.
      </p>

      {status === "loading" && <p>Loading...</p>}

      {status === "ready" && (
        <table className="prefs-table">
          <thead>
            <tr>
              <th>Notification</th>
              {Object.entries(CHANNEL_LABELS).map(([key, label]) => (
                <th key={key}>{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((pref) => (
              <tr key={pref.notificationId}>
                <td>
                  <strong>{formatId(pref.notificationId)}</strong>
                  {pref.description && <span className="pref-desc">{pref.description}</span>}
                  {pref.required && <span className="badge">Required</span>}
                </td>
                {Object.keys(CHANNEL_LABELS).map((ch) => {
                  const enabled = pref.channels?.[ch] !== false;
                  return (
                    <td key={ch}>
                      <input
                        type="checkbox"
                        checked={enabled}
                        disabled={pref.required}
                        onChange={() =>
                          update({
                            notificationId: pref.notificationId,
                            channels: { ...pref.channels, [ch]: !enabled },
                          })
                        }
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function formatId(id: string) {
  return id.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}
