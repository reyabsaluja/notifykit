# @notifykitjs/testing

Testing utilities for [NotifyKit](https://github.com/reyabsaluja/notifykit). Provides a pre-configured test harness, assertion helpers, and inspection APIs for writing notification tests.

## Install

```bash
npm install @notifykitjs/testing --save-dev
```

## Quick Start

```typescript
import { describe, test, expect } from "bun:test"; // or vitest
import { notification, channel } from "@notifykitjs/core";
import { createTestNotifyKit, assertSentEmail, assertInboxItem } from "@notifykitjs/testing";

const welcome = notification({
  id: "welcome",
  payload: { name: "string" },
  channels: [
    channel.inbox()({ title: "Welcome {{name}}!" }),
    channel.email()({ subject: "Welcome {{name}}", body: "Hello {{name}}" }),
  ],
});

describe("welcome notification", () => {
  test("sends email and creates inbox item", async () => {
    const notify = createTestNotifyKit([welcome] as const);
    await notify.upsertRecipient({ id: "user_1", email: "alice@example.com" });

    await notify.send({
      recipientId: "user_1",
      notificationId: "welcome",
      payload: { name: "Alice" },
    });

    assertSentEmail(notify, { to: "alice@example.com", subject: "Welcome Alice" });
    assertInboxItem(notify, { recipientId: "user_1", title: /Welcome/ });
  });
});
```

## API

### `createTestNotifyKit(notifications, options?)`

Creates a fully configured NotifyKit instance with:
- In-memory database (`memoryAdapter`)
- Fake providers (email, SMS, webhook) that capture all sends
- Inline queue (synchronous delivery)
- Single-attempt retry (no backoff in tests)

Returns a `TestNotifyKit` instance with all standard NotifyKit methods plus a `testing` namespace.

### `notify.testing`

| Method/Property | Description |
|---|---|
| `.sentEmails()` | Returns array of captured email sends |
| `.sentSms()` | Returns array of captured SMS sends |
| `.sentWebhooks()` | Returns array of captured webhook sends |
| `.inboxFor(recipientId)` | Lists inbox items for a recipient |
| `.deliveriesFor(recipientId)` | Lists delivery records for a recipient |
| `.lastResult` | The most recent `SendResult` |
| `.results` | All `SendResult`s from this test |
| `.database` | Direct access to the memory adapter state |
| `.providers` | Direct access to fake providers |
| `.reset()` | Clears all state (providers, DB, results) |

### Assertion Helpers

```typescript
assertSentEmail(notify, { to?, subject?, body? })
assertNoEmailSent(notify)
assertInboxItem(notify, { recipientId?, notificationId?, title?, body? })
assertNoInboxItems(notify)
assertDelivery(notify, { channel?, status?, recipientId?, notificationId? })
assertNotificationSent(notify, notificationId)
assertNotificationNotSent(notify, notificationId)
```

String fields support exact substring match or `RegExp`.

## Dev Mode

NotifyKit core supports `mode: "development"` which blocks real provider sends:

```typescript
import { createNotifyKit } from "@notifykitjs/core";

const notify = createNotifyKit({
  notifications: [...],
  database: db,
  providers: { email: resend(...) },
  mode: "development",
  dev: {
    allowlist: ["dev@yourcompany.com"],
    subjectPrefix: "[STAGING] ",
  },
});
```

All sends are captured in `notify.captured` and logged to console. Only allowlisted addresses receive real delivery.
