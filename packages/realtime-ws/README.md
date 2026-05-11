# @notifykitjs/realtime-ws

WebSocket real-time adapter for [NotifyKit](https://www.npmjs.com/package/@notifykitjs/core). Pushes inbox updates to connected clients over WebSocket.

## Install

```bash
npm install @notifykitjs/realtime-ws
```

Requires `@notifykitjs/core` as a peer dependency.

## Usage

```ts
import { webSocketRealtimeAdapter } from "@notifykitjs/realtime-ws";

const realtime = webSocketRealtimeAdapter({
  authenticate: (req) => {
    const userId = verifyToken(req);
    return userId ? { recipientId: userId } : null;
  },
});

const notify = createNotifyKit({
  // ...
  realtime,
});
```

Features:

- Authentication via upgrade request
- Origin allowlist (CSWSH protection)
- Heartbeat with configurable interval
- Connection limit
- Multi-tenant scoping

## Docs

Full documentation: [github.com/reyabsaluja/notifykit](https://github.com/reyabsaluja/notifykit)

## License

[MIT](https://github.com/reyabsaluja/notifykit/blob/main/LICENSE)
