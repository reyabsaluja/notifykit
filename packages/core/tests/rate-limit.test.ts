import { describe, expect, test } from "bun:test";
import {
  channel,
  createNotifyKit,
  fakeEmailProvider,
  memoryAdapter,
  notification,
} from "../src/index.js";

const inbox = channel.inbox();

function buildLimited(
  rateLimit: { max: number; windowMs: number; scope?: "recipient" | "global" },
  hooks?: Parameters<typeof createNotifyKit>[0]["on"],
) {
  const def = notification({
    id: "alert",
    payload: { msg: "string" },
    channels: [inbox({ title: "{{msg}}" })],
    rateLimit,
  });
  const db = memoryAdapter();
  const notify = createNotifyKit({
    notifications: [def] as const,
    database: db,
    providers: { email: fakeEmailProvider() },
    on: hooks,
  });
  return { notify, db };
}

describe("rate limits", () => {
  test("allows sends up to max, drops the rest", async () => {
    const { notify, db } = buildLimited({ max: 2, windowMs: 1000 });
    await notify.upsertRecipient({ id: "u1" });

    const first = await notify.send({
      recipientId: "u1",
      notificationId: "alert",
      payload: { msg: "a" },
    });
    const second = await notify.send({
      recipientId: "u1",
      notificationId: "alert",
      payload: { msg: "b" },
    });
    const third = await notify.send({
      recipientId: "u1",
      notificationId: "alert",
      payload: { msg: "c" },
    });

    expect(first.rateLimited).toBe(false);
    expect(second.rateLimited).toBe(false);
    expect(third.rateLimited).toBe(true);
    expect(third.notification).toBeNull();
    expect(third.inboxItems).toEqual([]);
    expect(db._state.inboxItems).toHaveLength(2);
    expect(db._state.notifications).toHaveLength(2);
  });

  test("fires notification.rate_limited hook with limit config", async () => {
    const events: Array<{ id: string; limit: { max: number } }> = [];
    const { notify } = buildLimited(
      { max: 1, windowMs: 1000 },
      {
        "notification.rate_limited": ({ notificationId, limit }) => {
          events.push({ id: notificationId, limit });
        },
      },
    );
    await notify.upsertRecipient({ id: "u1" });
    await notify.send({
      recipientId: "u1",
      notificationId: "alert",
      payload: { msg: "a" },
    });
    await notify.send({
      recipientId: "u1",
      notificationId: "alert",
      payload: { msg: "b" },
    });
    expect(events).toEqual([{ id: "alert", limit: { max: 1, windowMs: 1000 } }]);
  });

  test("window slides — events age out", async () => {
    const { notify, db } = buildLimited({ max: 1, windowMs: 30 });
    await notify.upsertRecipient({ id: "u1" });
    await notify.send({
      recipientId: "u1",
      notificationId: "alert",
      payload: { msg: "a" },
    });
    const blocked = await notify.send({
      recipientId: "u1",
      notificationId: "alert",
      payload: { msg: "b" },
    });
    expect(blocked.rateLimited).toBe(true);
    expect(db._state.notifications).toHaveLength(1);

    await new Promise((r) => setTimeout(r, 50));

    const allowed = await notify.send({
      recipientId: "u1",
      notificationId: "alert",
      payload: { msg: "c" },
    });
    expect(allowed.rateLimited).toBe(false);
    expect(db._state.notifications).toHaveLength(2);
  });

  test("per-recipient scope is independent across recipients", async () => {
    const { notify, db } = buildLimited({ max: 1, windowMs: 1000 });
    await notify.upsertRecipient({ id: "u1" });
    await notify.upsertRecipient({ id: "u2" });

    const a1 = await notify.send({
      recipientId: "u1",
      notificationId: "alert",
      payload: { msg: "x" },
    });
    const b1 = await notify.send({
      recipientId: "u2",
      notificationId: "alert",
      payload: { msg: "y" },
    });
    expect(a1.rateLimited).toBe(false);
    expect(b1.rateLimited).toBe(false);
    expect(db._state.notifications).toHaveLength(2);
  });

  test("global scope is shared across recipients", async () => {
    const { notify, db } = buildLimited({
      max: 2,
      windowMs: 1000,
      scope: "global",
    });
    await notify.upsertRecipient({ id: "u1" });
    await notify.upsertRecipient({ id: "u2" });
    await notify.upsertRecipient({ id: "u3" });

    await notify.send({
      recipientId: "u1",
      notificationId: "alert",
      payload: { msg: "1" },
    });
    await notify.send({
      recipientId: "u2",
      notificationId: "alert",
      payload: { msg: "2" },
    });
    const third = await notify.send({
      recipientId: "u3",
      notificationId: "alert",
      payload: { msg: "3" },
    });
    expect(third.rateLimited).toBe(true);
    expect(db._state.notifications).toHaveLength(2);
  });

  test("rate limit runs before digest — dropped instead of buffered", async () => {
    const def = notification({
      id: "digested_limited",
      payload: { n: "number" },
      channels: [inbox({ title: "{{n}}" })],
      rateLimit: { max: 1, windowMs: 1000 },
      digest: {
        windowMs: 30,
        render: ({ count }) => ({ n: count }),
      },
    });
    const db = memoryAdapter();
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: db,
      providers: { email: fakeEmailProvider() },
    });
    await notify.upsertRecipient({ id: "u1" });

    const a = await notify.send({
      recipientId: "u1",
      notificationId: "digested_limited",
      payload: { n: 1 },
    });
    const b = await notify.send({
      recipientId: "u1",
      notificationId: "digested_limited",
      payload: { n: 2 },
    });

    expect(a.digested).toBe(true);
    expect(a.rateLimited).toBe(false);
    // Second one hits the rate limit — should NOT land in the digest bucket.
    expect(b.digested).toBe(false);
    expect(b.rateLimited).toBe(true);
    expect(db._state.digests).toHaveLength(1);
    expect(db._state.digests[0]!.payloads).toHaveLength(1);

    await notify.drain();
    expect(db._state.inboxItems).toHaveLength(1);
    expect(db._state.inboxItems[0]!.title).toBe("1");
  });

  test("notifications without rateLimit are unaffected", async () => {
    const unlimited = notification({
      id: "free",
      payload: { msg: "string" },
      channels: [inbox({ title: "{{msg}}" })],
    });
    const db = memoryAdapter();
    const notify = createNotifyKit({
      notifications: [unlimited] as const,
      database: db,
      providers: { email: fakeEmailProvider() },
    });
    await notify.upsertRecipient({ id: "u1" });
    for (let i = 0; i < 5; i++) {
      const result = await notify.send({
        recipientId: "u1",
        notificationId: "free",
        payload: { msg: `m${i}` },
      });
      expect(result.rateLimited).toBe(false);
    }
    expect(db._state.inboxItems).toHaveLength(5);
    expect(db._state.rateLimits).toEqual([]);
  });

  test("rate limit event log prunes aged events during count()", async () => {
    const { notify, db } = buildLimited({ max: 100, windowMs: 20 });
    await notify.upsertRecipient({ id: "u1" });

    await notify.send({
      recipientId: "u1",
      notificationId: "alert",
      payload: { msg: "old" },
    });
    expect(db._state.rateLimits).toHaveLength(1);

    await new Promise((r) => setTimeout(r, 40));

    // Triggering a new count() call should prune the aged event even though
    // the cap is far from hit.
    await notify.send({
      recipientId: "u1",
      notificationId: "alert",
      payload: { msg: "new" },
    });
    // The stale event should be gone; only the fresh one remains.
    expect(db._state.rateLimits).toHaveLength(1);
  });
});
