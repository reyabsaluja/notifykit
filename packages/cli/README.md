# notifykit-cli

CLI for [NotifyKit](https://www.npmjs.com/package/notifykit) — validate notification definitions at build time.

## Install

```bash
npm install notifykit-cli
```

Requires `notifykit` as a peer dependency.

## Usage

```bash
npx notifykit validate
```

Loads your `notifykit.config.ts` and validates all notification definitions — catches missing template variables, invalid channel configurations, and payload mismatches before they reach production.

## Config

```ts
// notifykit.config.ts
import { defineConfig } from "notifykit-cli";

export default defineConfig({
  notifications: "./lib/notifykit.ts",
});
```

## Docs

Full documentation: [github.com/reyabsaluja/notifykit](https://github.com/reyabsaluja/notifykit)

## License

[MIT](https://github.com/reyabsaluja/notifykit/blob/main/LICENSE)
