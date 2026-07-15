# NotifyKit

App-native notifications for TypeScript. Define notifications in code, store state in your own database, and ship inbox, email, preferences, and signed unsubscribes — without running a notification platform.

[![CI](https://github.com/reyabsaluja/notifykit/actions/workflows/ci.yml/badge.svg)](https://github.com/reyabsaluja/notifykit/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

> **Preview status:** NotifyKit `0.0.x` is ready for demos, prototypes, and
> evaluation. The public API is still allowed to change before `0.1`, and the
> default queues are not durable across process crashes. See
> [Production readiness](#production-readiness) before using it for critical
> delivery.

## Why this exists

NotifyKit is deliberately a framework, not another notification control
plane. Definitions live beside the code that triggers them, state stays in
your existing database, and delivery runs inside your application or worker.
There is no separate workflow dashboard to synchronize with your deploys.

Use NotifyKit when you have a TypeScript application, prefer code review over
a visual workflow editor, and want to own the notification data model. Choose
a managed platform such as Knock, Courier, SuprSend, or Novu Cloud when you
need non-engineers to edit workflows, many turnkey channel integrations,
managed delivery infrastructure, or built-in campaign analytics. Choose
self-hosted Novu when you want a complete standalone notification platform
and are comfortable operating its control plane.

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
- **Your database, your tables** — memory for dev plus Drizzle persistence for SQLite and Postgres
- **Inbox, email, SMS, and webhook contracts** — Resend, SMTP, and signed webhook integrations included; bring an SMS provider
- **Per-recipient preferences** with per-notification and per-category granularity
- **Signed unsubscribe links** — HMAC-signed, no session required to opt out
- **Digests and rate limits** — two lines of config
- **Retries and fallback channels** — automatic retry with configurable backoff and channel escalation
- **Quiet hours** — per-recipient delivery windows
- **React hooks** — `useInbox()`, `useUnreadCount()`, `usePreferences()`, `<NotificationBell />`
- **Next.js integration** — route handler, server actions, middleware
- **Real-time** — WebSocket and Postgres LISTEN/NOTIFY adapters
- **Dev mode** — `mode: "development"` blocks real sends, captures outbound messages, allowlist for safe addresses
- **Testing utilities** — `createTestNotifyKit()` with assertion helpers and state inspection
- **CLI** — validate notification definitions at build time

## Packages

| Package | Description |
|---------|-------------|
| [`@notifykitjs/core`](packages/core) | Core engine — notifications, channels, delivery, preferences |
| [`@notifykitjs/drizzle`](packages/drizzle-adapter) | Drizzle ORM adapter (SQLite + Postgres) |
| [`@notifykitjs/react`](packages/react) | React hooks and components |
| [`@notifykitjs/next`](packages/next) | Next.js route handler, server actions, middleware |
| [`@notifykitjs/resend`](packages/resend) | Resend email provider |
| [`@notifykitjs/nodemailer`](packages/nodemailer) | Nodemailer/SMTP provider (package-ready; npm publication pending) |
| [`@notifykitjs/testing`](packages/testing) | Test harness, fake providers, assertion helpers |
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

## Testing

```bash
npm install @notifykitjs/testing --save-dev
```

```ts
import { createTestNotifyKit, assertSentEmail, assertInboxItem } from "@notifykitjs/testing";

const notify = createTestNotifyKit([commentMentioned] as const);
await notify.upsertRecipient({ id: "user_123", email: "jane@example.com" });

await notify.send({
  recipientId: "user_123",
  notificationId: "comment_mentioned",
  payload: { actorName: "Rey", postTitle: "Launch Plan", postUrl: "/posts/123" },
});

assertSentEmail(notify, { to: "jane@example.com", subject: /mentioned you/ });
assertInboxItem(notify, { recipientId: "user_123", title: /mentioned/ });
```

## Dev mode

Block real sends in development — no accidental emails to production users:

```ts
const notify = createNotifyKit({
  // ...
  mode: "development",
  dev: {
    allowlist: ["dev@yourteam.com"],
    subjectPrefix: "[DEV] ",
  },
});

// notify.captured — array of all blocked/allowed sends
// notify.isDev — true
```

## Persistent setup

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

## Production readiness

The Postgres adapter gives you durable state, but it does not make the default
delivery queue durable. `inlineQueue()` performs delivery before `send()`
returns; `setTimeoutQueue()` can lose in-flight work when a process exits. For
critical notifications, connect the exported `Queue` contract to a durable
worker and call `notify.processDeliveryJob()` there.

Before treating NotifyKit as production infrastructure, also plan for:

- versioned database migrations instead of table-creation helpers at startup;
- provider delivery webhooks and suppression handling for bounces/complaints;
- monitoring the delivery timeline and failed deliveries;
- load testing against your own database, provider, and queue topology.

Queue redelivery after a terminal database update is ignored. There is still a
small crash window between provider acceptance and recording success, so
critical delivery should use provider idempotency where available and tolerate
at-least-once execution.

The demo and starter intentionally use the in-memory adapter and reset when the
server restarts. See [ROADMAP.md](ROADMAP.md) for the production-stability
milestones.

## Security

- Unsubscribe tokens are HMAC-SHA256 signed — set `NOTIFYKIT_SECRET` in production
- Webhook payloads are signed with a shared secret for receiver verification
- The HTTP handler supports `identify()` and `authorize()` callbacks for auth
- Multi-tenant scoping (`organizationId`, `workspaceId`) isolates data between tenants

See [SECURITY.md](SECURITY.md) for responsible disclosure instructions.

## Roadmap

The immediate goal is a trustworthy embedded notification framework, not
feature parity with hosted platforms. Durable delivery, versioned migrations,
bounce suppression, recovery tools, and benchmarks come before adding a long
tail of providers or channels. See [ROADMAP.md](ROADMAP.md) and the
[issue board](https://github.com/reyabsaluja/notifykit/issues) for the ordered
scope.

## Contributing

Bug reports and focused pull requests are welcome. Read
[CONTRIBUTING.md](CONTRIBUTING.md) for the local verification commands and the
project's scope guidelines.

## License

[MIT](LICENSE)
