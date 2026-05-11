# @notifykitjs/cli

CLI for [NotifyKit](https://www.npmjs.com/package/@notifykitjs/core) — validate notification definitions at build time.

## Install

```bash
npm install @notifykitjs/cli
```

Installs `@notifykitjs/core` as a dependency.

## Usage

```bash
npx notifykit check
```

Loads your `notifykit.config.ts` and validates all notification definitions — catches missing template variables, invalid channel configurations, and payload mismatches before they reach production.

## Config

```ts
// notifykit.config.ts
import { defineConfig } from "@notifykitjs/cli";
import { channel, notification } from "@notifykitjs/core";

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
