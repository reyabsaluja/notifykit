import {
  channel,
  createHandler,
  createNotifyKit,
  fakeEmailProvider,
  memoryAdapter,
  notification,
} from "notifykit";

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

const notify = createNotifyKit({
  notifications: [commentMentioned] as const,
  database: memoryAdapter(),
  providers: { email: fakeEmailProvider() },
});

// In a real app this would verify a session cookie / JWT.
// Here we trust an `x-user-id` header to keep the demo small.
const handler = createHandler(notify, {
  identify: (req) => req.headers.get("x-user-id"),
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

  const server = Bun.serve({
    port: 0, // pick any free port
    fetch: handler,
  });

  const base = `http://localhost:${server.port}/api/notifykit`;
  const headers = { "x-user-id": "user_123" };

  console.log(`Server listening on ${base}`);

  console.log("\nGET /notifications (public)");
  console.log(await (await fetch(`${base}/notifications`)).json());

  console.log("\nGET /inbox without auth → expect 401");
  const unauth = await fetch(`${base}/inbox`);
  console.log(`status=${unauth.status}`, await unauth.json());

  console.log("\nGET /inbox as user_123");
  const inboxRes = await fetch(`${base}/inbox`, { headers });
  const inboxBody = (await inboxRes.json()) as {
    data: Array<{ id: string; title: string }>;
  };
  console.log(inboxBody);

  const firstId = inboxBody.data[0]?.id;
  if (firstId) {
    console.log(`\nPOST /inbox/${firstId}/read`);
    const readRes = await fetch(`${base}/inbox/${firstId}/read`, {
      method: "POST",
      headers,
    });
    console.log(await readRes.json());
  }

  console.log("\nPOST /preferences { notificationId, channels: { email: false } }");
  const prefRes = await fetch(`${base}/preferences`, {
    method: "POST",
    headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify({
      notificationId: "comment_mentioned",
      channels: { email: false },
    }),
  });
  console.log(await prefRes.json());

  console.log("\nGET /preferences");
  console.log(await (await fetch(`${base}/preferences`, { headers })).json());

  server.stop();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
