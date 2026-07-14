import {
  channel,
  createNotifyKit,
  fakeEmailProvider,
  memoryAdapter,
  notification,
} from "@notifykitjs/core";

const inbox = channel.inbox();
const email = channel.email();

// A notification with digest: multiple rapid mentions get batched into one email.
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
      body: "{{actorName}} mentioned you in {{postTitle}}. Open {{postUrl}} to reply.",
    }),
  ],
  digest: {
    windowMs: 3_000, // 3 seconds for demo (use minutes/hours in production)
    render: ({ payloads, count }) => {
      if (count === 1) return payloads[0]!;
      const names = [...new Set(payloads.map((p) => p.actorName))];
      return {
        actorName: names.length > 2
          ? `${names[0]}, ${names[1]}, and ${names.length - 2} others`
          : names.join(" and "),
        postTitle: `${count} posts`,
        postUrl: "/notifications",
      };
    },
  },
});

// A notification with rate limiting: max 3 per hour per recipient.
const newFollower = notification({
  id: "new_follower",
  payload: {
    followerName: "string",
    followerUrl: "string",
  },
  channels: [
    inbox({
      title: "{{followerName}} followed you",
      actionUrl: "{{followerUrl}}",
    }),
    email({
      subject: "{{followerName}} started following you",
      body: "{{followerName}} is now following you. View their profile at {{followerUrl}}.",
    }),
  ],
  rateLimit: {
    max: 3,
    windowMs: 60 * 60_000, // 1 hour
    scope: "recipient",
  },
});

const provider = fakeEmailProvider();

const notify = createNotifyKit({
  notifications: [commentMentioned, newFollower] as const,
  database: memoryAdapter(),
  providers: { email: provider },
  on: {
    "notification.created": ({ notification }) => {
      console.log(`  [created] ${notification.notificationId}`);
    },
    "delivery.sent": ({ delivery }) => {
      console.log(`  [delivered] ${delivery.channel} → ${delivery.to}`);
    },
  },
});

async function main() {
  await notify.upsertRecipient({
    id: "user_1",
    email: "jane@example.com",
    name: "Jane",
  });

  // --- Digest demo ---
  console.log("=== Digest demo ===");
  console.log("Sending 4 mentions rapidly (3s digest window)...\n");

  const actors = ["Alice", "Bob", "Charlie", "Diana"];
  for (const actorName of actors) {
    try {
      const result = await notify.send({
        recipientId: "user_1",
        notificationId: "comment_mentioned",
        payload: {
          actorName,
          postTitle: `${actorName}'s Post`,
          postUrl: `/posts/${actorName.toLowerCase()}`,
        },
      });
      console.log(`  send(${actorName}): digested=${result.digested}`);
    } catch (err) {
      console.error(`  send(${actorName}) failed:`, err instanceof Error ? err.message : err);
    }
  }

  console.log("\nWaiting 4 seconds for digest window to expire...");
  await new Promise((resolve) => setTimeout(resolve, 4_000));

  console.log("Flushing digests (may already be auto-flushed by timer)...");
  await notify.flushDigests();
  console.log(`  Digest email subject: "${provider.sent.at(-1)?.subject}"`);
  console.log(`  Total emails so far: ${provider.sent.length}`);

  // --- Rate limit demo ---
  console.log("\n=== Rate limit demo ===");
  console.log("Sending 5 follower notifications (limit: 3/hour)...\n");

  for (let i = 1; i <= 5; i++) {
    try {
      const result = await notify.send({
        recipientId: "user_1",
        notificationId: "new_follower",
        payload: {
          followerName: `User${i}`,
          followerUrl: `/users/user${i}`,
        },
      });
      console.log(`  send(User${i}): rateLimited=${result.rateLimited}`);
    } catch (err) {
      console.error(`  send(User${i}) failed:`, err instanceof Error ? err.message : err);
    }
  }

  console.log(`\nTotal emails actually sent: ${provider.sent.length}`);
  console.log("Email subjects:");
  provider.sent.forEach((e) => console.log(`  - ${e.subject}`));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
