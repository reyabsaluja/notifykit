# Multi-tenant example

Demonstrates tenant-scoped notifications, preferences, and inbox isolation.

## Run

```bash
bun start
```

## What it demonstrates

### Tenant defaults

Each tenant can have different default channel settings:

```typescript
tenantDefaults: (tenantId) => {
  if (tenantId === "acme") return { email: false };
  return { inbox: true, email: true };
}
```

### Scoped operations

All operations accept a security scope (`tenantId`, `organizationId`, `workspaceId`):

- `send({ ..., tenantId })` — notification scoped to tenant
- `inbox.list(recipientId, { tenantId })` — only items for that tenant
- `preferences.update({ ..., tenantId })` — per-tenant preference
- `preferences.explain({ ..., tenantId })` — full resolution trail

### Isolation guarantees

- Inbox items from one tenant are invisible to queries scoped to another
- Preferences set under one tenant don't affect another
- Rate limits and dedup keys are scoped per tenant
