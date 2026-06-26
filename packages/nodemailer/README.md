# @notifykitjs/nodemailer

[Nodemailer](https://nodemailer.com) email provider for [NotifyKit](https://www.npmjs.com/package/@notifykitjs/core). Works with any SMTP server — SendGrid, Postmark, AWS SES, Mailgun, and more.

## Install

```bash
npm install @notifykitjs/nodemailer nodemailer
```

Requires `@notifykitjs/core` and `nodemailer` as peer dependencies.

## Usage

### SMTP (any provider)

```ts
import { nodemailerProvider } from "@notifykitjs/nodemailer";

const notify = createNotifyKit({
  // ...
  providers: {
    email: nodemailerProvider({
      from: "Acme <no-reply@acme.com>",
      host: "smtp.example.com",
      port: 587,
      auth: { user: "apikey", pass: process.env.SMTP_PASSWORD! },
    }),
  },
});
```

### Connection URL

```ts
nodemailerProvider({
  from: "Acme <no-reply@acme.com>",
  url: process.env.SMTP_URL!, // e.g. "smtps://user:pass@smtp.sendgrid.net:465"
})
```

### SendGrid

```ts
nodemailerProvider({
  from: "Acme <no-reply@acme.com>",
  host: "smtp.sendgrid.net",
  port: 587,
  auth: { user: "apikey", pass: process.env.SENDGRID_API_KEY! },
})
```

### AWS SES

```ts
nodemailerProvider({
  from: "Acme <no-reply@acme.com>",
  host: "email-smtp.us-east-1.amazonaws.com",
  port: 465,
  secure: true,
  auth: { user: process.env.SES_SMTP_USER!, pass: process.env.SES_SMTP_PASS! },
})
```

### Postmark

```ts
nodemailerProvider({
  from: "Acme <no-reply@acme.com>",
  host: "smtp.postmarkapp.com",
  port: 587,
  auth: { user: process.env.POSTMARK_API_KEY!, pass: process.env.POSTMARK_API_KEY! },
})
```

### Pre-built transport

```ts
import { createTransport } from "nodemailer";

const transport = createTransport({ /* your config */ });

nodemailerProvider({
  from: "Acme <no-reply@acme.com>",
  transport,
})
```

## Options

| Option | Required | Description |
|--------|----------|-------------|
| `from` | Yes | Default sender address |
| `host` | * | SMTP hostname |
| `port` | No | SMTP port (default 587) |
| `auth` | No | `{ user, pass }` credentials |
| `secure` | No | Use TLS (default true for port 465) |
| `url` | * | SMTP connection URL |
| `transport` | * | Pre-configured Nodemailer transport |
| `replyTo` | No | Reply-to address |
| `timeoutMs` | No | Send timeout in ms (default 10000) |

\* Provide one of `host`, `url`, or `transport`.

## Error handling

SMTP errors with permanent failure codes (550-554) are marked as `permanent`, so NotifyKit skips retries and triggers fallback channels immediately. Transient errors (timeouts, connection issues) are retried normally.

## Docs

Full documentation: [github.com/reyabsaluja/notifykit](https://github.com/reyabsaluja/notifykit)

## License

[MIT](https://github.com/reyabsaluja/notifykit/blob/main/LICENSE)
