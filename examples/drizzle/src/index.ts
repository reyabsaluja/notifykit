import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import {
  channel,
  createNotifyKit,
  fakeEmailProvider,
  notification,
} from "@notifykitjs/core";
import {
  createSqliteTables,
  drizzleSqliteAdapter,
} from "@notifykitjs/drizzle";

const inbox = channel.inbox();
const email = channel.email();

const commentMentioned = notification({
  id: "comment_mentioned",
  payload: {
    actorName: "string",
    postTitle: "string",
    postUrl: "string",
  },
  channels: [
    inbox({
      title: "{{actorName}} mentioned you",
      body: "In {{postTitle}}",
      actionUrl: "{{postUrl}}",
    }),
    email({
      subject: "{{actorName}} mentioned you in {{postTitle}}",
      body: "Open {{postUrl}} to reply.",
    }),
  ],
});

async function main() {
  const sqlite = new Database(":memory:");
  const db = drizzle(sqlite);
  await createSqliteTables(db);

  const provider = fakeEmailProvider();
  const notify = createNotifyKit({
    notifications: [commentMentioned] as const,
    database: drizzleSqliteAdapter(db),
    providers: { email: provider },
  });

  await notify.upsertRecipient({
    id: "user_123",
    email: "jane@example.com",
    name: "Jane",
  });

  await notify.send({
    recipientId: "user_123",
    notificationId: "comment_mentioned",
    payload: {
      actorName: "Rey",
      postTitle: "Launch Plan",
      postUrl: "/posts/123",
    },
  });

  console.log("Inbox items:");
  console.log(await notify.inbox.list("user_123"));

  console.log("\nDeliveries:");
  console.log(await notify.deliveries.list("user_123"));

  // Opt this user out of email for this notification type
  await notify.preferences.update({
    recipientId: "user_123",
    notificationId: "comment_mentioned",
    channels: { email: false },
  });

  const second = await notify.send({
    recipientId: "user_123",
    notificationId: "comment_mentioned",
    payload: {
      actorName: "Ada",
      postTitle: "Q2 Roadmap",
      postUrl: "/posts/456",
    },
  });

  console.log(
    `\nSecond send — skipped: ${second.skippedChannels.join(", ") || "(none)"}`,
  );
  console.log(`Total emails sent: ${provider.sent.length}`);

  // Raw SQL proof: the data is really in SQLite
  const rows = sqlite
    .query("SELECT id, notification_id FROM notifykit_inbox_items")
    .all();
  console.log("\nRaw SQL from notifykit_inbox_items:");
  console.log(rows);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
