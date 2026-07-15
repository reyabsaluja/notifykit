# @notifykitjs/react

React hooks and components for [NotifyKit](https://www.npmjs.com/package/@notifykitjs/core).

## Install

```bash
npm install @notifykitjs/react
```

Requires `@notifykitjs/core` and `react` (>=18) as peer dependencies.

## Usage

```tsx
import {
  NotificationBell,
  NotifyKitProvider,
  useInbox,
  useUnreadCount,
} from "@notifykitjs/react";

function App() {
  return (
    <NotifyKitProvider options={{ baseUrl: "/api/notifykit" }}>
      <NotificationBell />
      <Inbox />
    </NotifyKitProvider>
  );
}

function Inbox() {
  const { items, markAsRead } = useInbox({ pollInterval: 10_000 });
  const { unreadCount } = useUnreadCount({ pollInterval: 10_000 });
  return (
    <ul>
      {items.map((item) => (
        <li key={item.id} onClick={() => markAsRead(item.id)}>
          {item.title}
        </li>
      ))}
    </ul>
  );
}
```

## Exports

- `NotifyKitProvider` — context provider, connects to the NotifyKit API
- `useInbox()` — inbox items, unread count, mark-read
- `useUnreadCount()` — lightweight unread badge state without loading items
- `usePreferences()` — read and update per-notification channel preferences
- `NotificationBell` — pre-built bell icon with unread badge
- `Inbox` — pre-built inbox dropdown component
- `createNotifyKitClient` — headless client for custom integrations

## Docs

Full documentation: [github.com/reyabsaluja/notifykit](https://github.com/reyabsaluja/notifykit)

## License

[MIT](https://github.com/reyabsaluja/notifykit/blob/main/LICENSE)
