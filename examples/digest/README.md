# Digest & rate limiting example

Demonstrates two mechanisms for reducing notification noise.

## Run

```bash
bun start
```

## What it demonstrates

### Digests

Multiple rapid sends are buffered into a single notification:

- 4 "mentioned you" notifications arrive within 3 seconds
- They are batched into one digest with a merged payload
- The `render` callback produces a human-readable summary
- `flushDigests()` fires the batched notification after the window expires

### Rate limiting

A per-recipient cap prevents notification flooding:

- `new_follower` is limited to 3 sends per hour per recipient
- The first 3 sends deliver normally
- Sends 4 and 5 return `rateLimited: true` and skip all channels

## Production usage

In production you'd use longer windows and a cron/scheduler:

```typescript
// Digest: batch mentions over 5 minutes
digest: { windowMs: 5 * 60_000, render: ... }

// Rate limit: max 10 emails per hour
rateLimit: { max: 10, windowMs: 60 * 60_000, scope: "recipient" }

// Flush on a schedule (e.g. every minute via cron)
setInterval(() => notify.flushDigests(), 60_000)
```
