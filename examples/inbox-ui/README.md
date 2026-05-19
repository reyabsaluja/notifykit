# Inbox UI example

A Next.js 15 app showing a styled notification bell and inbox panel using `@notifykitjs/react`.

## Run

```bash
bun install
bun dev
```

Open [http://localhost:3100](http://localhost:3100) and click the bell icon.

## What it demonstrates

- `<NotifyKitProvider>` wrapping the app
- `useInbox()` hook for fetching items, unread count, and mutations
- Bell badge with live unread count
- Inbox panel with mark-read, archive, and delete actions
- Dark mode support via `prefers-color-scheme`
- API route handler via `createRouteHandler` from `@notifykitjs/next`
- Auto-seeding demo data on first request
