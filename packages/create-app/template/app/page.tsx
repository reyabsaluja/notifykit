import Link from "next/link";
import { sendDemoNotification, signInAsDemoUser } from "./actions";
import { getCurrentUserId } from "../lib/session";
import { InboxView } from "./_components/inbox-view";

export default async function HomePage() {
  const userId = await getCurrentUserId();

  return (
    <main>
      <h1>NotifyKit starter</h1>
      <p>
        App-native, type-safe notifications for your Next.js app. Inbox,
        email, preferences, unsubscribe — all running locally, out of the
        box.
      </p>

      {userId ? (
        <>
          <p>
            Signed in as <strong>{userId}</strong>.
          </p>
          <section>
            <h2>Send a test notification</h2>
            <form
              action={sendDemoNotification}
              style={{ display: "grid", gap: "0.5rem", maxWidth: "24rem" }}
            >
              <label>
                Actor name
                <input
                  name="actorName"
                  defaultValue="Rey"
                  style={{ width: "100%" }}
                />
              </label>
              <label>
                Post title
                <input
                  name="postTitle"
                  defaultValue="Launch Plan"
                  style={{ width: "100%" }}
                />
              </label>
              <button type="submit">Send</button>
            </form>
          </section>
          <section style={{ marginTop: "2rem" }}>
            <h2>Your inbox</h2>
            <InboxView />
          </section>
          <p style={{ marginTop: "2rem" }}>
            <Link href="/settings/notifications">
              Manage your notification preferences →
            </Link>
          </p>
        </>
      ) : (
        <form action={signInAsDemoUser}>
          <button type="submit">Sign in as demo user</button>
        </form>
      )}
    </main>
  );
}
