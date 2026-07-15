# NotifyKit roadmap

NotifyKit's goal is to be the notification framework that feels native to a
TypeScript application: definitions in the repository, state in the
application database, and no required external control plane.

This is an ordered roadmap, not a promise that every open issue belongs in the
next release.

## Available in the 0.0.x preview

- Typed notification definitions and `notify.send()` payloads
- Inbox, email, SMS, and webhook channel contracts
- Resend, Nodemailer/SMTP, generic webhook, and fake providers
- SQLite and PostgreSQL persistence through Drizzle
- Recipient, category, tenant, and required-notification preferences
- Signed unsubscribe links and RFC 8058 one-click unsubscribe
- Idempotency, deduplication, digests, rate limits, quiet hours, retries, and
  channel fallbacks
- React inbox/preferences hooks and components
- Next.js handlers and server helpers
- SSE, WebSocket, and PostgreSQL realtime adapters
- Explain, delivery timeline, development capture, and testing utilities

## Before production-stable

These items take priority over expanding the channel matrix:

1. **Durable dispatch and transactional outbox** — delivery intent must survive
   deploys and crashes ([#14](https://github.com/reyabsaluja/notifykit/issues/14),
   [#34](https://github.com/reyabsaluja/notifykit/issues/34)).
2. **Versioned database migrations** — ship reviewable Drizzle migrations for
   every schema change ([#42](https://github.com/reyabsaluja/notifykit/issues/42)).
3. **Bounce and complaint suppression** — ingest provider webhooks, update
   delivery status, and prevent repeated sends to suppressed addresses
   ([#15](https://github.com/reyabsaluja/notifykit/issues/15),
   [#51](https://github.com/reyabsaluja/notifykit/issues/51),
   [#52](https://github.com/reyabsaluja/notifykit/issues/52)).
4. **Recovery operations** — list failures and safely retry, resend, or cancel
   deliveries ([#103](https://github.com/reyabsaluja/notifykit/issues/103)).
5. **Pagination and measured performance budgets** — remove unbounded list
   behavior and publish reproducible benchmarks
   ([#27](https://github.com/reyabsaluja/notifykit/issues/27),
   [#95](https://github.com/reyabsaluja/notifykit/issues/95)).
6. **Complete package release** — publish every documented package, including
   `@notifykitjs/nodemailer`.

## Next differentiators

After the reliability baseline:

- `notifykit doctor` for database, migration, provider, and secret checks
  ([#67](https://github.com/reyabsaluja/notifykit/issues/67))
- A localhost-only studio for inspecting definitions, sends, and failures
  without creating a hosted control plane
  ([#69](https://github.com/reyabsaluja/notifykit/issues/69))
- File and React Email templates with typed variables and stored render
  snapshots ([#101](https://github.com/reyabsaluja/notifykit/issues/101))
- Generated contracts and reference docs
  ([#102](https://github.com/reyabsaluja/notifykit/issues/102))
- Small, tested SaaS notification recipes
  ([#107](https://github.com/reyabsaluja/notifykit/issues/107))

## Intentionally later

Push providers, a broad email/SMS provider matrix, marketing broadcasts,
visual workflow editing, and framework adapters beyond the initial TypeScript
stack are useful, but they do not define the initial product. They should not
delay the reliability and developer-experience work above.

