# @notifykit/realtime-pg

Postgres LISTEN/NOTIFY real-time adapter for [NotifyKit](https://www.npmjs.com/package/notifykit). Broadcasts events across multiple server instances using Postgres pub/sub.

## Install

```bash
npm install @notifykit/realtime-pg
```

Requires `notifykit` as a peer dependency.

## Usage

```ts
import { pgRealtimeAdapter } from "@notifykit/realtime-pg";

const realtime = pgRealtimeAdapter({
  connection: pgClient, // must support listen/unlisten/notify
});

await realtime.start();

const notify = createNotifyKit({
  // ...
  realtime,
});
```

Useful when running multiple server instances — events published on one instance are received by listeners on all instances via Postgres.

## Docs

Full documentation: [github.com/reyabsaluja/notifykit](https://github.com/reyabsaluja/notifykit)

## License

[MIT](https://github.com/reyabsaluja/notifykit/blob/main/LICENSE)
