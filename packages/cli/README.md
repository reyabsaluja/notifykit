# notifykit-cli

CLI for [NotifyKit](https://www.npmjs.com/package/notifykit) — validate notification definitions at build time.

## Install

```bash
npm install notifykit-cli
```

Requires `notifykit` as a peer dependency.

## Usage

```bash
npx notifykit check
```

Loads your `notifykit.config.ts` and validates all notification definitions — catches missing template variables, invalid channel configurations, and payload mismatches before they reach production.

## Config

```ts
// notifykit.config.ts
import { defineConfig } from "notifykit-cli";
import { channel, notification } from "notifykit";

const inbox = channel.inbox();

export default defineConfig({
  notifications: [
    notification({
      id: "comment_mentioned",
      payload: { actorName: "string" },
      channels: [inbox({ title: "{{actorName}} mentioned you" })],
    }),
  ],
});
```

## Docs

Full documentation: [github.com/reyabsaluja/notifykit](https://github.com/reyabsaluja/notifykit)

## License

[MIT](https://github.com/reyabsaluja/notifykit/blob/main/LICENSE)
