import { describe, expect, test } from "bun:test";
import {
  channel,
  createNotifyKit,
  fakeEmailProvider,
  memoryAdapter,
  notification,
} from "../src/index.js";

const inbox = channel.inbox();
const email = channel.email();

function setup(opts?: { ttlMs?: number }) {
  const db = memoryAdapter();
  const emailProvider = fakeEmailProvider();
  const def = notification({
    id: "alert",
    payload: { msg: "string" },
    channels: [
      inbox({ title: "{{msg}}" }),
      email({ subject: "{{msg}}", body: "Body: {{msg}}" }),
    ],
  });
  const notify = createNotifyKit({
    notifications: [def] as const,
    database: db,
    providers: { email: emailProvider },
    idempotencyKeyTtlMs: opts?.ttlMs,
  });
  return { db, emailProvider, notify };
}

describe("idempotency keys", () => {
  test("duplicate send with same key returns original result without re-processing", async () => {
    const { db, emailProvider, notify } = setup();
    await notify.upsertRecipient({ id: "u1", email: "u1@test.com" });

    const first = await notify.send({
      recipientId: "u1",
      notificationId: "alert",
      payload: { msg: "hello" },
      idempotencyKey: "key-1",
    });

    const second = await notify.send({
      recipientId: "u1",
      notificationId: "alert",
      payload: { msg: "hello" },
      idempotencyKey: "key-1",
    });

    expect(first.idempotent).toBe(false);
    expect(second.idempotent).toBe(true);
    expect(second.notification!.id).toBe(first.notification!.id);
    expect(second.deliveries.length).toBe(first.deliveries.length);
    expect(second.inboxItems.length).toBe(first.inboxItems.length);

    // Only one notification record created
    expect(db._state.notifications).toHaveLength(1);
    // Only one set of deliveries
    expect(db._state.inboxItems).toHaveLength(1);
    // Email sent only once
    expect(emailProvider.sent).toHaveLength(1);
  });

  test("different keys produce separate notifications", async () => {
    const { db, notify } = setup();
    await notify.upsertRecipient({ id: "u1", email: "u1@test.com" });

    const first = await notify.send({
      recipientId: "u1",
      notificationId: "alert",
      payload: { msg: "a" },
      idempotencyKey: "key-a",
    });
    const second = await notify.send({
      recipientId: "u1",
      notificationId: "alert",
      payload: { msg: "b" },
      idempotencyKey: "key-b",
    });

    expect(first.idempotent).toBe(false);
    expect(second.idempotent).toBe(false);
    expect(first.notification!.id).not.toBe(second.notification!.id);
    expect(db._state.notifications).toHaveLength(2);
  });

  test("same key scoped per recipient — different recipients are independent", async () => {
    const { db, notify } = setup();
    await notify.upsertRecipient({ id: "u1", email: "u1@test.com" });
    await notify.upsertRecipient({ id: "u2", email: "u2@test.com" });

    const r1 = await notify.send({
      recipientId: "u1",
      notificationId: "alert",
      payload: { msg: "x" },
      idempotencyKey: "shared-key",
    });
    const r2 = await notify.send({
      recipientId: "u2",
      notificationId: "alert",
      payload: { msg: "x" },
      idempotencyKey: "shared-key",
    });

    expect(r1.idempotent).toBe(false);
    expect(r2.idempotent).toBe(false);
    expect(db._state.notifications).toHaveLength(2);
  });

  test("same key deduplicates regardless of tenantId on send", async () => {
    const { db, notify } = setup();
    // Recipient without a fixed tenant — accepts any tenantId on send
    await notify.upsertRecipient({ id: "u1", email: "u1@test.com" });

    const r1 = await notify.send({
      recipientId: "u1",
      tenantId: "t1",
      notificationId: "alert",
      payload: { msg: "x" },
      idempotencyKey: "tenant-key",
    });
    const r2 = await notify.send({
      recipientId: "u1",
      tenantId: "t2",
      notificationId: "alert",
      payload: { msg: "x" },
      idempotencyKey: "tenant-key",
    });

    // Idempotency key is scoped to (key, notificationId, recipientId) — NOT tenant.
    // The same logical send retried with a different tenant context is still a dupe.
    expect(r1.idempotent).toBe(false);
    expect(r2.idempotent).toBe(true);
    expect(db._state.notifications).toHaveLength(1);
  });

  test("expired key allows re-send after TTL", async () => {
    const { db, notify } = setup({ ttlMs: 50 });
    await notify.upsertRecipient({ id: "u1", email: "u1@test.com" });

    await notify.send({
      recipientId: "u1",
      notificationId: "alert",
      payload: { msg: "first" },
      idempotencyKey: "expire-key",
    });

    // Artificially age the notification record past the TTL
    db._state.notifications[0].createdAt = new Date(Date.now() - 100);

    const second = await notify.send({
      recipientId: "u1",
      notificationId: "alert",
      payload: { msg: "second" },
      idempotencyKey: "expire-key",
    });

    expect(second.idempotent).toBe(false);
    expect(db._state.notifications).toHaveLength(2);
  });

  test("sends without idempotencyKey are never deduplicated", async () => {
    const { db, notify } = setup();
    await notify.upsertRecipient({ id: "u1", email: "u1@test.com" });

    await notify.send({
      recipientId: "u1",
      notificationId: "alert",
      payload: { msg: "a" },
    });
    await notify.send({
      recipientId: "u1",
      notificationId: "alert",
      payload: { msg: "a" },
    });

    expect(db._state.notifications).toHaveLength(2);
  });

  test("concurrent sends with same key only process once", async () => {
    const { db, emailProvider, notify } = setup();
    await notify.upsertRecipient({ id: "u1", email: "u1@test.com" });

    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        notify.send({
          recipientId: "u1",
          notificationId: "alert",
          payload: { msg: "concurrent" },
          idempotencyKey: "concurrent-key",
        }),
      ),
    );

    const originals = results.filter((r) => !r.idempotent);
    const replays = results.filter((r) => r.idempotent);

    // Exactly one original (the first to write wins)
    expect(originals).toHaveLength(1);
    expect(replays).toHaveLength(9);

    // All replays reference the same notification
    const id = originals[0].notification!.id;
    for (const r of replays) {
      expect(r.notification!.id).toBe(id);
    }

    // Only one email sent
    expect(emailProvider.sent).toHaveLength(1);
    expect(db._state.notifications).toHaveLength(1);
  });

  test("idempotent replay preserves skipped/deferred state", async () => {
    const db = memoryAdapter();
    const def = notification({
      id: "prefs-test",
      payload: { msg: "string" },
      channels: [
        inbox({ title: "{{msg}}" }),
        email({ subject: "{{msg}}", body: "Body: {{msg}}" }),
      ],
    });
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: db,
      providers: { email: fakeEmailProvider() },
    });
    await notify.upsertRecipient({ id: "u1" });
    // Disable email via preferences — only inbox delivers
    await notify.preferences.update({
      recipientId: "u1",
      notificationId: "prefs-test",
      channels: { email: false },
    });

    const first = await notify.send({
      recipientId: "u1",
      notificationId: "prefs-test",
      payload: { msg: "test" },
      idempotencyKey: "pref-key",
    });

    const second = await notify.send({
      recipientId: "u1",
      notificationId: "prefs-test",
      payload: { msg: "test" },
      idempotencyKey: "pref-key",
    });

    expect(second.idempotent).toBe(true);
    expect(second.skipped.length).toBeGreaterThan(0);
    expect(second.inboxItems).toHaveLength(1);
  });

  test("idempotencyKey is silently ignored for digested notifications", async () => {
    const db = memoryAdapter();
    const def = notification({
      id: "digest-notif",
      payload: { msg: "string" },
      channels: [inbox({ title: "{{msg}}" })],
      digest: {
        windowMs: 5000,
        key: ({ recipientId }) => recipientId,
        render: ({ payloads }) => ({ msg: payloads.map((p) => p.msg).join(", ") }),
      },
    });
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: db,
      providers: { email: fakeEmailProvider() },
    });
    await notify.upsertRecipient({ id: "u1" });

    const first = await notify.send({
      recipientId: "u1",
      notificationId: "digest-notif",
      payload: { msg: "a" },
      idempotencyKey: "digest-key",
    });
    const second = await notify.send({
      recipientId: "u1",
      notificationId: "digest-notif",
      payload: { msg: "b" },
      idempotencyKey: "digest-key",
    });

    // Both sends are buffered into the digest — idempotency key has no effect
    expect(first.digested).toBe(true);
    expect(first.idempotent).toBe(false);
    expect(second.digested).toBe(true);
    expect(second.idempotent).toBe(false);
  });

  test("incomplete notification record (no deliveries) is not replayed", async () => {
    const db = memoryAdapter();
    const emailProvider = fakeEmailProvider();
    const def = notification({
      id: "alert",
      payload: { msg: "string" },
      channels: [
        inbox({ title: "{{msg}}" }),
        email({ subject: "{{msg}}", body: "Body: {{msg}}" }),
      ],
    });
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: db,
      providers: { email: emailProvider },
    });
    await notify.upsertRecipient({ id: "u1", email: "u1@test.com" });

    // Simulate an incomplete record (created but delivery never finished)
    const compositeKey = JSON.stringify(["idem", "alert", "u1", "incomplete-key"]);
    db._state.notifications.push({
      id: "orphan-record",
      recipientId: "u1",
      notificationId: "alert",
      payload: { msg: "old" },
      idempotencyKey: compositeKey,
      createdAt: new Date(),
    });

    const result = await notify.send({
      recipientId: "u1",
      notificationId: "alert",
      payload: { msg: "new" },
      idempotencyKey: "incomplete-key",
    });

    // Should NOT replay the incomplete record — should process fresh
    expect(result.idempotent).toBe(false);
    expect(result.deliveries.length).toBeGreaterThan(0);
    expect(emailProvider.sent).toHaveLength(1);
  });

  test("rejects idempotencyKey longer than 256 characters", async () => {
    const { notify } = setup();
    await notify.upsertRecipient({ id: "u1", email: "u1@test.com" });

    expect(
      notify.send({
        recipientId: "u1",
        notificationId: "alert",
        payload: { msg: "hi" },
        idempotencyKey: "x".repeat(257),
      }),
    ).rejects.toThrow("idempotencyKey must be 256 characters or fewer");
  });
});
