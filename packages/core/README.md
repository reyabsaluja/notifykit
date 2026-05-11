# notifykit

Core engine for NotifyKit — define notifications in code, send across channels, manage inbox state and per-recipient preferences.

## Install

```bash
npm install @notifykitjs/core
```

## Usage

```ts
import {
  channel,
  createNotifyKit,
  fakeEmailProvider,
  memoryAdapter,
  notification,
} from "@notifykitjs/core";

const inbox = channel.inbox();
const email = channel.email();

const commentMentioned = notification({
  id: "comment_mentioned",
  payload: { actorName: "string", postTitle: "string", postUrl: "string" },
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

await notify.upsertRecipient({ id: "user_123", email: "jane@example.com" });
await notify.send({
  recipientId: "user_123",
  notificationId: "comment_mentioned",
  payload: { actorName: "Rey", postTitle: "Launch Plan", postUrl: "/posts/123" },
});
```

The memory adapter is great for dev and testing. For production, use [`@notifykitjs/drizzle`](https://www.npmjs.com/package/@notifykitjs/drizzle) for SQLite or Postgres persistence.

## Schema validation

Optional peer dependencies for payload validation at runtime:

```bash
npm install zod        # or valibot, or arktype
```

```ts
import { zodPayload } from "@notifykitjs/core/zod";
```

## Docs

Full documentation: [github.com/reyabsaluja/notifykit](https://github.com/reyabsaluja/notifykit)

## License

[MIT](https://github.com/reyabsaluja/notifykit/blob/main/LICENSE)
