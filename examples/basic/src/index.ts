import {
  channel,
  createNotifyKit,
  fakeEmailProvider,
  memoryAdapter,
  notification,
  type SendResult,
} from "@notifykitjs/core";

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

const provider = fakeEmailProvider();

function skippedSummary(result: SendResult): string {
  return result.skipped.map((s) => `${s.channel}:${s.reason}`).join(", ") || "(none)";
}

const notify = createNotifyKit({
  notifications: [commentMentioned] as const,
  database: memoryAdapter(),
  providers: {
    email: provider,
  },
  on: {
    "notification.created": ({ notification }) => {
      console.log(
        `[hook] notification.created -> ${notification.notificationId} (${notification.id})`,
      );
    },
    "inbox.created": ({ inboxItem }) => {
      console.log(`[hook] inbox.created -> "${inboxItem.title}"`);
    },
    "delivery.sent": ({ delivery }) => {
      console.log(
        `[hook] delivery.sent -> ${delivery.to} via ${delivery.provider}`,
      );
    },
    "delivery.failed": ({ delivery, error }) => {
      console.log(
        `[hook] delivery.failed -> ${delivery.to}: ${error.message}`,
      );
    },
  },
});

async function main() {
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

  const inboxItems = await notify.inbox.list("user_123");
  console.log("\nInbox items:");
  console.log(inboxItems);

  const deliveries = await notify.deliveries.list("user_123");
  console.log("\nDeliveries:");
  console.log(deliveries);

  if (inboxItems[0]) {
    await notify.inbox.markReadForRecipient(inboxItems[0].id, "user_123");
    const refreshed = await notify.inbox.list("user_123");
    console.log("\nInbox after markRead:");
    console.log(refreshed);
  }

  console.log("\nFake provider sent:");
  console.log(provider.sent);

  console.log("\n--- Preferences demo ---");
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
    `Second send — skipped: ${skippedSummary(second)}`,
  );
  console.log(`Inbox items created: ${second.inboxItems.length}`);
  console.log(`Deliveries created: ${second.deliveries.length}`);
  console.log(`Total emails sent so far: ${provider.sent.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
