# my-notifykit-app

A Next.js app wired up with **NotifyKit** — inbox, email, preferences, and
signed unsubscribe links. Type-safe, app-native, your own database.

## Quick start

```bash
cp .env.example .env.local
# Generate the unsubscribe signing secret:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# paste into .env.local as NOTIFYKIT_SECRET

npm install
npm run dev
```

Open http://localhost:3000. Click "Sign in as demo user", send yourself a
test notification, and manage preferences at `/settings/notifications`.

## How it works

- `lib/notifykit.ts` — define your notifications and wire up the engine.
  Defaults: in-memory adapter, fake email provider.
- `app/api/notifykit/[...route]/route.ts` — mounts `createHandler()` on
  `/api/notifykit` and keeps the demo send endpoint in the same runtime as the
  in-memory adapter. `identify()` reads the demo session cookie.
- `app/layout.tsx` — wraps the tree in `<NotifyKitProvider>` so the inbox
  and preferences hooks work on the client.
- `app/page.tsx` — inbox + send form. The client form posts to
  `/api/notifykit/demo-send`; use your own authenticated server code to call
  `notify.send()` in production.
- `app/settings/notifications/page.tsx` — preferences table.

## Moving to production

### Real database (SQLite + Drizzle)

```bash
npm install @notifykitjs/drizzle drizzle-orm better-sqlite3
```

Replace the adapter in `lib/notifykit.ts`:

```ts
import Database from "better-sqlite3"
import { drizzle } from "drizzle-orm/better-sqlite3"
import { createSqliteTables, drizzleSqliteAdapter } from "@notifykitjs/drizzle"

const db = drizzle(new Database("app.db"))
await createSqliteTables(db)  // one-off; use drizzle-kit in production

export const notify = createNotifyKit({
  // ...
  database: drizzleSqliteAdapter(db),
})
```

### Real email (Resend)

```bash
npm install @notifykitjs/resend
```

Set `RESEND_API_KEY` and `RESEND_FROM` in `.env.local`, then:

```ts
import { resendProvider } from "@notifykitjs/resend"

providers: {
  email: resendProvider({
    apiKey: process.env.RESEND_API_KEY!,
    from: process.env.RESEND_FROM!,
  }),
},
```

### Real auth

The demo's `getCurrentUserId()` reads a cookie. Replace it with your auth
system of choice — NextAuth, Clerk, Lucia, Auth.js — and return the real
user id from `identify()`.

## Next steps

- Add your own notifications to `lib/notifykit.ts`. Use `{{_unsubscribeUrl}}`
  in email bodies to get compliant unsubscribe links for free.
- Turn on digests (`digest: { windowMs, render }`) for high-volume notifications.
- Turn on rate limits (`rateLimit: { max, windowMs }`) for transactional ones.
- Configure quiet hours per recipient: `upsertRecipient({ quietHours: { start: "22:00", end: "08:00", timezone: "America/New_York" } })`.

See the [NotifyKit docs](https://github.com/reyabsaluja/notifykit) for more.
