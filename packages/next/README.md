# @notifykit/next

Next.js integration for [NotifyKit](https://www.npmjs.com/package/notifykit) — route handler, server actions, and middleware.

## Install

```bash
npm install @notifykit/next
```

Requires `notifykit` and `next` (>=14) as peer dependencies.

## Usage

### Route handler

```ts
// app/api/notifykit/[...route]/route.ts
import { createRouteHandler } from "@notifykit/next";
import { notify } from "@/lib/notifykit";

export const { GET, POST, DELETE, OPTIONS, dynamic } = createRouteHandler({
  notifykit: notify,
  identify: (req) => getCurrentUserId(req),
});
```

### Server actions

```ts
// app/actions/notifykit.ts
"use server";

import { createServerActions } from "@notifykit/next";
import { notify } from "@/lib/notifykit";

const actions = createServerActions({
  notifykit: notify,
  identify: () => getCurrentUserId(),
});

export async function listNotifications() {
  return actions.inbox.list();
}

export async function markNotificationRead(id: string) {
  return actions.inbox.markRead(id);
}
```

### Middleware

```ts
// middleware.ts
import { createNotifyKitMiddleware } from "@notifykit/next/middleware";

export default createNotifyKitMiddleware({
  cors: { origin: "https://app.example.com" },
});
```

## Docs

Full documentation: [github.com/reyabsaluja/notifykit](https://github.com/reyabsaluja/notifykit)

## License

[MIT](https://github.com/reyabsaluja/notifykit/blob/main/LICENSE)
