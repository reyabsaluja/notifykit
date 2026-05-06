# notifykit-resend

[Resend](https://resend.com) email provider for [NotifyKit](https://www.npmjs.com/package/notifykit).

## Install

```bash
npm install notifykit-resend
```

Requires `notifykit` as a peer dependency.

## Usage

```ts
import { resendProvider } from "notifykit-resend";

const notify = createNotifyKit({
  // ...
  providers: {
    email: resendProvider({
      apiKey: process.env.RESEND_API_KEY!,
      from: "Acme <no-reply@acme.com>",
      replyTo: "support@acme.com", // optional
    }),
  },
});
```

Non-2xx responses from Resend throw, so the retry and fallback pipeline handles transient failures automatically.

## Docs

Full documentation: [github.com/reyabsaluja/notifykit](https://github.com/reyabsaluja/notifykit)

## License

[MIT](https://github.com/reyabsaluja/notifykit/blob/main/LICENSE)
