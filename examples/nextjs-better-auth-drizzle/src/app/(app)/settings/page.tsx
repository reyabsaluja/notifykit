"use client";

import { useEffect, useState } from "react";
import {
  useNotifyKitClient,
  usePreferences,
  type NotificationMetadata,
} from "@notifykitjs/react";

const CHANNEL_KEYS = ["inbox", "email"] as const;

const CHANNEL_LABELS: Record<(typeof CHANNEL_KEYS)[number], string> = {
  inbox: "In-app",
  email: "Email",
};

export default function SettingsPage() {
  const client = useNotifyKitClient();
  const { items, status, update } = usePreferences();
  const [definitions, setDefinitions] = useState<NotificationMetadata[]>([]);
  const [definitionsLoaded, setDefinitionsLoaded] = useState(false);

  useEffect(() => {
    client.notifications
      .list()
      .then((defs) => {
        setDefinitions(defs);
        setDefinitionsLoaded(true);
      })
      .catch(() => setDefinitionsLoaded(true));
  }, [client]);

  const merged = definitions.map((def) => {
    const saved = items.find((pref) => pref.notificationId === def.id);
    return {
      notificationId: def.id,
      description: def.description,
      required: def.required ?? false,
      channels: saved?.channels ?? {},
    };
  });

  return (
    <div className="settings">
      <h2>Notification preferences</h2>
      <p className="settings-desc">
        Choose which channels to receive notifications on.
      </p>

      {(status === "loading" || !definitionsLoaded) && <p>Loading...</p>}

      {status === "ready" && definitionsLoaded && (
        <table className="prefs-table">
          <thead>
            <tr>
              <th>Notification</th>
              {CHANNEL_KEYS.map((key) => (
                <th key={key}>{CHANNEL_LABELS[key]}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {merged.map((pref) => (
              <tr key={pref.notificationId}>
                <td>
                  <strong>{formatId(pref.notificationId)}</strong>
                  {pref.description && <span className="pref-desc">{pref.description}</span>}
                  {pref.required && <span className="badge">Required</span>}
                </td>
                {CHANNEL_KEYS.map((ch) => {
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
