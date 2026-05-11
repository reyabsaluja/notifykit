# NotifyKit

App-native notifications for TypeScript. Define notifications in code, store state in your own database, and ship inbox, email, preferences, and signed unsubscribes — without running a notification platform.

[![CI](https://github.com/reyabsaluja/notifykit/actions/workflows/ci.yml/badge.svg)](https://github.com/reyabsaluja/notifykit/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

## Quick start

```bash
npx create-notifykit-app my-app
cd my-app
cp .env.example .env.local
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# paste the generated value into .env.local as NOTIFYKIT_SECRET
npm install
npm run dev
```

## Install

```bash
npm install @notifykitjs/core
```

## Minimal example

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

## Features

- **Type-safe `notify.send()`** — wrong notification id or payload shape is a TypeScript error
- **Your database, your tables** — memory adapter for dev, Drizzle adapters (SQLite + Postgres) for production
- **Inbox + email + SMS + webhook** channels out of the box
- **Per-recipient preferences** with per-notification and per-category granularity
- **Signed unsubscribe links** — HMAC-signed, no session required to opt out
- **Digests and rate limits** — two lines of config
- **Retries and fallback channels** — automatic retry with configurable backoff and channel escalation
- **Quiet hours** — per-recipient delivery windows
- **React hooks** — `useInbox()`, `usePreferences()`, `<NotificationBell />`
- **Next.js integration** — route handler, server actions, middleware
- **Real-time** — WebSocket and Postgres LISTEN/NOTIFY adapters
- **CLI** — validate notification definitions at build time

## Packages

| Package | Description |
|---------|-------------|
| [`@notifykitjs/core`](packages/core) | Core engine — notifications, channels, delivery, preferences |
| [`@notifykitjs/drizzle`](packages/drizzle-adapter) | Drizzle ORM adapter (SQLite + Postgres) |
| [`@notifykitjs/react`](packages/react) | React hooks and components |
| [`@notifykitjs/next`](packages/next) | Next.js route handler, server actions, middleware |
| [`@notifykitjs/resend`](packages/resend) | Resend email provider |
| [`@notifykitjs/cli`](packages/cli) | CLI for validating notification definitions |
| [`create-notifykit-app`](packages/create-app) | Project scaffolding |
| [`@notifykitjs/realtime-ws`](packages/realtime-ws) | WebSocket real-time adapter |
| [`@notifykitjs/realtime-pg`](packages/realtime-pg) | Postgres LISTEN/NOTIFY real-time adapter |

## Examples

```bash
# Basic — send + inbox + preferences
bun run example

# HTTP handler — REST API with auth
bun run example:handler

# Drizzle — SQLite persistence
bun run example:drizzle
```

See the [`examples/`](examples) directory for full source code.

## Production setup

### Database

Replace the memory adapter with a Drizzle adapter:

```bash
npm install @notifykitjs/drizzle drizzle-orm better-sqlite3
```

```ts
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { createSqliteTables, drizzleSqliteAdapter } from "@notifykitjs/drizzle";

const db = drizzle(new Database("app.db"));
await createSqliteTables(db);

const notify = createNotifyKit({
  // ...
  database: drizzleSqliteAdapter(db),
});
```

### Email

```bash
npm install @notifykitjs/resend
```

```ts
import { resendProvider } from "@notifykitjs/resend";

const notify = createNotifyKit({
  // ...
  providers: {
    email: resendProvider({
      apiKey: process.env.RESEND_API_KEY!,
      from: process.env.RESEND_FROM!,
    }),
  },
});
```

## Security

- Unsubscribe tokens are HMAC-SHA256 signed — set `NOTIFYKIT_SECRET` in production
- Webhook payloads are signed with a shared secret for receiver verification
- The HTTP handler supports `identify()` and `authorize()` callbacks for auth
- Multi-tenant scoping (`organizationId`, `workspaceId`) isolates data between tenants

## Roadmap

These features are planned but **not yet shipped** in v0.0:

- MySQL Drizzle adapter
- Push notification channel (FCM / APNs)
- Dashboard UI

## License

[MIT](LICENSE)
