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

function setup() {
  const db = memoryAdapter();
  const emailProvider = fakeEmailProvider();
  const def = notification({
    id: "mention",
    payload: { user: "string", project: "string" },
    channels: [
      inbox({ title: "{{user}} mentioned you in {{project}}" }),
      email({ subject: "Mention from {{user}}", body: "In {{project}}" }),
    ],
  });
  const notify = createNotifyKit({
    notifications: [def] as const,
    database: db,
    providers: { email: emailProvider },
  });
  return { db, emailProvider, notify };
}

describe("deduplication keys", () => {
  test("first send with dedupeKey delivers normally", async () => {
    const { emailProvider, notify } = setup();
    await notify.upsertRecipient({ id: "u1", email: "u1@test.com" });

    const result = await notify.send({
      recipientId: "u1",
      notificationId: "mention",
      payload: { user: "alice", project: "acme" },
      dedupeKey: "mention:alice:acme",
      dedupeWindowMs: 60_000,
    });

    expect(result.notification).not.toBeNull();
    expect(result.skipped).toHaveLength(0);
    expect(emailProvider.sent).toHaveLength(1);
  });

  test("duplicate send within window is skipped with reason 'duplicate'", async () => {
    const { db, emailProvider, notify } = setup();
    await notify.upsertRecipient({ id: "u1", email: "u1@test.com" });

    const first = await notify.send({
      recipientId: "u1",
      notificationId: "mention",
      payload: { user: "alice", project: "acme" },
      dedupeKey: "mention:alice:acme",
      dedupeWindowMs: 60_000,
    });

    const second = await notify.send({
      recipientId: "u1",
      notificationId: "mention",
      payload: { user: "alice", project: "acme" },
      dedupeKey: "mention:alice:acme",
      dedupeWindowMs: 60_000,
    });

    expect(first.skipped).toHaveLength(0);
    expect(second.skipped).toHaveLength(2);
    expect(second.skipped[0].reason).toBe("duplicate");
    expect(second.skipped[1].reason).toBe("duplicate");
    expect(second.notification).not.toBeNull();
    expect(second.idempotent).toBe(false);

    // Email only sent once
    expect(emailProvider.sent).toHaveLength(1);
    // Two notification records created (dedup still creates a record for audit)
    expect(db._state.notifications).toHaveLength(2);
  });

  test("different dedupeKeys are independent", async () => {
    const { emailProvider, notify } = setup();
    await notify.upsertRecipient({ id: "u1", email: "u1@test.com" });

    await notify.send({
      recipientId: "u1",
      notificationId: "mention",
      payload: { user: "alice", project: "acme" },
      dedupeKey: "mention:alice:acme",
      dedupeWindowMs: 60_000,
    });

    const second = await notify.send({
      recipientId: "u1",
      notificationId: "mention",
      payload: { user: "bob", project: "acme" },
      dedupeKey: "mention:bob:acme",
      dedupeWindowMs: 60_000,
    });

    expect(second.skipped).toHaveLength(0);
    expect(emailProvider.sent).toHaveLength(2);
  });

  test("same dedupeKey scoped per recipient", async () => {
    const { emailProvider, notify } = setup();
    await notify.upsertRecipient({ id: "u1", email: "u1@test.com" });
    await notify.upsertRecipient({ id: "u2", email: "u2@test.com" });

    await notify.send({
      recipientId: "u1",
      notificationId: "mention",
      payload: { user: "alice", project: "acme" },
      dedupeKey: "shared-key",
      dedupeWindowMs: 60_000,
    });

    const result = await notify.send({
      recipientId: "u2",
      notificationId: "mention",
      payload: { user: "alice", project: "acme" },
      dedupeKey: "shared-key",
      dedupeWindowMs: 60_000,
    });

    // Different recipients should NOT be deduped
    expect(result.skipped).toHaveLength(0);
    expect(emailProvider.sent).toHaveLength(2);
  });

  test("send after window expires delivers normally", async () => {
    const { db, emailProvider, notify } = setup();
    await notify.upsertRecipient({ id: "u1", email: "u1@test.com" });

    await notify.send({
      recipientId: "u1",
      notificationId: "mention",
      payload: { user: "alice", project: "acme" },
      dedupeKey: "expire-key",
      dedupeWindowMs: 50,
    });

    // Artificially expire the dedup record
    db._state.dedupeRecords[0].expiresAt = new Date(Date.now() - 100);

    const second = await notify.send({
      recipientId: "u1",
      notificationId: "mention",
      payload: { user: "alice", project: "acme" },
      dedupeKey: "expire-key",
      dedupeWindowMs: 50,
    });

    expect(second.skipped).toHaveLength(0);
    expect(emailProvider.sent).toHaveLength(2);
  });

  test("sends without dedupeKey are never deduplicated", async () => {
    const { emailProvider, notify } = setup();
    await notify.upsertRecipient({ id: "u1", email: "u1@test.com" });

    await notify.send({
      recipientId: "u1",
      notificationId: "mention",
      payload: { user: "alice", project: "acme" },
    });
    await notify.send({
      recipientId: "u1",
      notificationId: "mention",
      payload: { user: "alice", project: "acme" },
    });

    expect(emailProvider.sent).toHaveLength(2);
  });

  test("dedupeKey requires dedupeWindowMs", async () => {
    const { notify } = setup();
    await notify.upsertRecipient({ id: "u1", email: "u1@test.com" });

    expect(
      notify.send({
        recipientId: "u1",
        notificationId: "mention",
        payload: { user: "alice", project: "acme" },
        dedupeKey: "key",
      }),
    ).rejects.toThrow("dedupeWindowMs is required");
  });

  test("dedupeKey must be 256 characters or fewer", async () => {
    const { notify } = setup();
    await notify.upsertRecipient({ id: "u1", email: "u1@test.com" });

    expect(
      notify.send({
        recipientId: "u1",
        notificationId: "mention",
        payload: { user: "alice", project: "acme" },
        dedupeKey: "x".repeat(257),
        dedupeWindowMs: 60_000,
      }),
    ).rejects.toThrow("dedupeKey must be 256 characters or fewer");
  });

  test("dedupeWindowMs must be 30 days or fewer", async () => {
    const { notify } = setup();
    await notify.upsertRecipient({ id: "u1", email: "u1@test.com" });

    expect(
      notify.send({
        recipientId: "u1",
        notificationId: "mention",
        payload: { user: "alice", project: "acme" },
        dedupeKey: "key",
        dedupeWindowMs: 31 * 24 * 60 * 60 * 1000,
      }),
    ).rejects.toThrow("dedupeWindowMs must be 30 days or fewer");
  });

  test("dedupeKey is independent of idempotencyKey", async () => {
    const { emailProvider, notify } = setup();
    await notify.upsertRecipient({ id: "u1", email: "u1@test.com" });

    // First send with both keys
    const first = await notify.send({
      recipientId: "u1",
      notificationId: "mention",
      payload: { user: "alice", project: "acme" },
      dedupeKey: "dedup-1",
      dedupeWindowMs: 60_000,
      idempotencyKey: "idem-1",
    });

    // Same dedupeKey, different idempotencyKey — should be deduped
    const second = await notify.send({
      recipientId: "u1",
      notificationId: "mention",
      payload: { user: "alice", project: "acme" },
      dedupeKey: "dedup-1",
      dedupeWindowMs: 60_000,
      idempotencyKey: "idem-2",
    });

    expect(first.skipped).toHaveLength(0);
    expect(second.skipped.length).toBeGreaterThan(0);
    expect(second.skipped[0].reason).toBe("duplicate");
    expect(emailProvider.sent).toHaveLength(1);
  });

  test("dedup still works with tenantId scoping", async () => {
    const { emailProvider, notify } = setup();
    await notify.upsertRecipient({ id: "u1", email: "u1@test.com" });

    await notify.send({
      recipientId: "u1",
      tenantId: "t1",
      notificationId: "mention",
      payload: { user: "alice", project: "acme" },
      dedupeKey: "tenant-dedup",
      dedupeWindowMs: 60_000,
    });

    // Same key, same recipient, different tenant — NOT deduped (key is scoped
    // to notificationId + recipientId, tenant is excluded like idempotency)
    const result = await notify.send({
      recipientId: "u1",
      tenantId: "t2",
      notificationId: "mention",
      payload: { user: "alice", project: "acme" },
      dedupeKey: "tenant-dedup",
      dedupeWindowMs: 60_000,
    });

    // dedup key composite includes (notificationId, recipientId, dedupeKey)
    // tenantId is excluded — so this IS a duplicate
    expect(result.skipped.length).toBeGreaterThan(0);
    expect(result.skipped[0].reason).toBe("duplicate");
    expect(emailProvider.sent).toHaveLength(1);
  });

  test("concurrent sends with same dedupeKey only deliver once", async () => {
    const { db, emailProvider, notify } = setup();
    await notify.upsertRecipient({ id: "u1", email: "u1@test.com" });

    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        notify.send({
          recipientId: "u1",
          notificationId: "mention",
          payload: { user: "alice", project: "acme" },
          dedupeKey: "concurrent-dedup",
          dedupeWindowMs: 60_000,
        }),
      ),
    );

    const delivered = results.filter((r) => r.skipped.length === 0);
    const deduped = results.filter((r) => r.skipped.some((s) => s.reason === "duplicate"));

    expect(delivered).toHaveLength(1);
    expect(deduped).toHaveLength(9);
    expect(emailProvider.sent).toHaveLength(1);
    // All 10 create notification records (dedup still persists for audit)
    expect(db._state.notifications).toHaveLength(10);
  });

  test("dedupeKey does not interfere with digested notifications", async () => {
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
      dedupeKey: "digest-dedup",
      dedupeWindowMs: 60_000,
    });
    const second = await notify.send({
      recipientId: "u1",
      notificationId: "digest-notif",
      payload: { msg: "b" },
      dedupeKey: "digest-dedup",
      dedupeWindowMs: 60_000,
    });

    // Dedup fires before the digest path — second send is skipped
    expect(first.digested).toBe(true);
    expect(first.skipped).toHaveLength(0);
    expect(second.digested).toBe(false);
    expect(second.skipped.length).toBeGreaterThan(0);
    expect(second.skipped[0].reason).toBe("duplicate");
  });
});
