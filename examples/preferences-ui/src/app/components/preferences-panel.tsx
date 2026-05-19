"use client";

import { usePreferences } from "@notifykitjs/react";

const CHANNEL_LABELS: Record<string, string> = {
  inbox: "In-app",
  email: "Email",
  sms: "SMS",
  webhook: "Webhook",
};

const CATEGORY_LABELS: Record<string, string> = {
  social: "Social",
  tasks: "Tasks",
  billing: "Billing",
  security: "Security",
};

export function PreferencesPanel() {
  const { items, status, update } = usePreferences();

  if (status === "loading") {
    return <div className="loading">Loading preferences...</div>;
  }

  const grouped = items.reduce(
    (acc, item) => {
      const cat = item.category ?? "other";
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(item);
      return acc;
    },
    {} as Record<string, typeof items>,
  );

  return (
    <div className="prefs">
      <div className="prefs-header">
        <h1>Notification preferences</h1>
        <p>Choose how you want to be notified for each type of event.</p>
      </div>

      {Object.entries(grouped).map(([category, prefs]) => (
        <section key={category} className="prefs-section">
          <h2 className="prefs-category">
            {CATEGORY_LABELS[category] ?? category}
          </h2>

          <div className="prefs-table">
            <div className="prefs-table-header">
              <span className="prefs-col-name">Notification</span>
              {["inbox", "email", "sms"].map((ch) => (
                <span key={ch} className="prefs-col-channel">
                  {CHANNEL_LABELS[ch]}
                </span>
              ))}
            </div>

            {prefs.map((pref) => (
              <div key={pref.notificationId} className="prefs-row">
                <div className="prefs-col-name">
                  <strong>{formatId(pref.notificationId)}</strong>
                  {pref.description && (
                    <span className="prefs-desc">{pref.description}</span>
                  )}
                  {pref.required && (
                    <span className="prefs-badge">Required</span>
                  )}
                </div>
                {["inbox", "email", "sms"].map((ch) => {
                  const enabled = pref.channels?.[ch] !== false;
                  const available = pref.availableChannels?.includes(ch) ?? true;
                  const locked = pref.required;

                  return (
                    <label
                      key={ch}
                      className={`prefs-col-channel toggle-label ${locked ? "locked" : ""}`}
                    >
                      <input
                        type="checkbox"
                        checked={enabled}
                        disabled={!available || locked}
                        onChange={() => {
                          update({
                            notificationId: pref.notificationId,
                            channels: {
                              ...pref.channels,
                              [ch]: !enabled,
                            },
                          });
                        }}
                      />
                      <span className="toggle-track">
                        <span className="toggle-thumb" />
                      </span>
                    </label>
                  );
                })}
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function formatId(id: string) {
  return id.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}
