import type { Metadata } from "next";
import Link from "next/link";
import { sendDemoComment, sendWelcome } from "./actions";
import { DemoInbox } from "./_components/demo-inbox";
import { DemoPreferences } from "./_components/demo-preferences";

export const metadata: Metadata = { title: "Live demo" };

export default function DemoPage() {
  return (
    <article>
      <h1>Live demo</h1>
      <p>
        This page is a real NotifyKit instance running inside the docs site.
        Your browser has its own demo recipient so you won&apos;t see anyone
        else&apos;s inbox. Click a button to send yourself a notification,
        then watch it appear below.
      </p>

      <h2>Send a test notification</h2>
      <div className="button-row">
        <form action={sendWelcome}>
          <button type="submit" className="primary">
            Send welcome
          </button>
        </form>
        <form
          action={sendDemoComment}
          style={{ display: "inline-flex", gap: "0.5rem", flexWrap: "wrap" }}
        >
          <input
            name="actorName"
            defaultValue="Rey"
            aria-label="Actor name"
            style={{ padding: "0.4rem" }}
          />
          <input
            name="postTitle"
            defaultValue="Launch Plan"
            aria-label="Post title"
            style={{ padding: "0.4rem" }}
          />
          <button type="submit">Send comment mention</button>
        </form>
      </div>

      <h2>Your inbox</h2>
      <DemoInbox />

      <h2>Your preferences</h2>
      <p style={{ color: "var(--fg-muted)" }}>
        Turning off email doesn&apos;t change what you see here (the docs
        demo doesn&apos;t send real email), but on subsequent sends the
        delivery row will be skipped and reported in{" "}
        <code>result.skipped</code>.
      </p>
      <DemoPreferences />

      <hr />
      <p style={{ color: "var(--fg-muted)" }}>
        Want to build this yourself?{" "}
        <Link href="/docs/installation">Start here</Link>.
      </p>
    </article>
  );
}
