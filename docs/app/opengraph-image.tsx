import { ImageResponse } from "next/og";

export const alt = "NotifyKit — App-native notifications for TypeScript";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#000000",
          color: "#ededed",
          padding: "72px 80px",
          fontFamily: "Arial, sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            fontSize: 38,
            fontWeight: 600,
            letterSpacing: "-1px",
          }}
        >
          NotifyKit
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              fontSize: 76,
              fontWeight: 600,
              lineHeight: 1.03,
              letterSpacing: "-4px",
              maxWidth: 1000,
            }}
          >
            <span>Notifications,</span>
            <span style={{ color: "#a1a1a1" }}>in your stack.</span>
          </div>
          <div style={{ fontSize: 30, color: "#a1a1a1" }}>
            TypeScript notification infrastructure that runs inside your app.
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            color: "#777777",
            fontSize: 24,
          }}
        >
          <span>notifykit.cc</span>
          <span>github.com/reyabsaluja/notifykit</span>
        </div>
      </div>
    ),
    size,
  );
}
