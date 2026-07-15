import type { Metadata } from "next";
import Link from "next/link";
import { DemoInbox } from "./_components/demo-inbox";
import { DemoPreferences } from "./_components/demo-preferences";
import { DemoSender } from "./_components/demo-sender";

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
      <p style={{ color: "var(--fg-muted)" }}>
        Demo data is stored in memory and may reset when the docs deployment
        restarts.
      </p>

      <h2>Send a test notification</h2>
      <DemoSender />

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
