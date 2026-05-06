import { describe, expect, test } from "bun:test";
import {
  channel,
  createNotifyKit,
  fakeEmailProvider,
  memoryAdapter,
  notification,
} from "../src/index.js";

const inbox = channel.inbox();

describe("rate limit atomicity (memory adapter)", () => {
  test("concurrent sends cannot exceed max", async () => {
    const def = notification({
      id: "alert",
      payload: { msg: "string" },
      channels: [inbox({ title: "{{msg}}" })],
      rateLimit: { max: 3, windowMs: 5_000 },
    });
    const db = memoryAdapter();
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: db,
      providers: { email: fakeEmailProvider() },
    });
    await notify.upsertRecipient({ id: "u1" });

    // Fire 20 sends concurrently — only 3 should be allowed through.
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        notify.send({
          recipientId: "u1",
          notificationId: "alert",
          payload: { msg: `m_${i}` },
        }),
      ),
    );
    const allowed = results.filter((r) => !r.rateLimited).length;
    const rateLimited = results.filter((r) => r.rateLimited).length;
    expect(allowed).toBe(3);
    expect(rateLimited).toBe(17);
    expect(db._state.inboxItems).toHaveLength(3);
    expect(db._state.rateLimits).toHaveLength(3);
  });

  test("global scope under contention still caps at max", async () => {
    const def = notification({
      id: "broadcast",
      payload: { msg: "string" },
      channels: [inbox({ title: "{{msg}}" })],
      rateLimit: { max: 2, windowMs: 5_000, scope: "global" },
    });
    const db = memoryAdapter();
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: db,
      providers: { email: fakeEmailProvider() },
    });
    for (let i = 0; i < 5; i++) {
      await notify.upsertRecipient({ id: `u${i}` });
    }
    const results = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        notify.send({
          recipientId: `u${i}`,
          notificationId: "broadcast",
          payload: { msg: "!" },
        }),
      ),
    );
    const allowed = results.filter((r) => !r.rateLimited).length;
    expect(allowed).toBe(2);
  });
});

describe("scheduled send lifecycle", () => {
  test("provider failure does not drop the row", async () => {
    const def = notification({
      id: "alert",
      payload: { msg: "string" },
      channels: [
        inbox({ title: "{{msg}}" }),
        channel.email()({ subject: "{{msg}}", body: "{{msg}}" }),
      ],
    });
    const db = memoryAdapter();
    let attempts = 0;
    const flakyProvider = {
      id: "flaky",
      async send() {
        attempts++;
        if (attempts === 1) throw new Error("first attempt fails");
        return { providerMessageId: "ok" };
      },
    };
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: db,
      providers: { email: flakyProvider },
      retry: { maxAttempts: 1, delayMs: () => 0 },
    });

    // Quiet-hours window that contains "now" in UTC.
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const start = `${pad((now.getUTCHours() + 23) % 24)}:${pad(
      now.getUTCMinutes(),
    )}`;
    const end = `${pad((now.getUTCHours() + 1) % 24)}:${pad(
      now.getUTCMinutes(),
    )}`;

    await notify.upsertRecipient({
      id: "u1",
      email: "u@x.com",
      quietHours: { start, end, timezone: "UTC" },
    });

    // First send — inbox writes now, email defers to a scheduled row.
    await notify.send({
      recipientId: "u1",
      notificationId: "alert",
      payload: { msg: "hi" },
    });
    expect(db._state.scheduledSends).toHaveLength(1);
    const scheduledId = db._state.scheduledSends[0]!.id;

    // Force-flush. Provider throws on attempt 1, retries disabled → email
    // delivery fails → deliver() completes (inbox success + email failed),
    // so the scheduled-send row should be COMPLETED (deleted).
    await notify.flushScheduledSends();
    expect(db._state.scheduledSends).toEqual([]);

    // But the delivery row records the failure, which is the whole point
    // of a retry pipeline — the row is completed because we *attempted*.
    const deliveries = await notify.deliveries.list("u1");
    expect(deliveries.some((d) => d.status === "failed")).toBe(true);
    void scheduledId;
  });

  test("a flush that throws before delivery releases the claim", async () => {
    const def = notification({
      id: "alert",
      payload: { msg: "string" },
      channels: [
        channel.email()({ subject: "{{msg}}", body: "{{msg}}" }),
      ],
    });
    const db = memoryAdapter();
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: db,
      providers: { email: fakeEmailProvider() },
    });

    // Put a row directly in the store with a past scheduledFor and a
    // recipient that doesn't exist — flushScheduledSend will complete it
    // as unrecoverable, so we instead create a scenario where deliver()
    // throws before completion.
    await notify.upsertRecipient({ id: "u1", email: "u@x.com" });
    const row = await db.scheduledSends.create({
      recipientId: "u1",
      notificationId: "alert",
      payload: { msg: "hi" },
      scheduledFor: new Date(Date.now() - 1000),
      reason: "quiet_hours",
    });

    // Monkey-patch deliveries.create to throw — simulates a DB error after
    // the claim but before completion.
    const originalCreate = db.deliveries.create;
    let thrown = false;
    db.deliveries.create = async (input) => {
      if (!thrown) {
        thrown = true;
        throw new Error("simulated DB blip");
      }
      return originalCreate.call(db.deliveries, input);
    };

    // The sweep should claim, then fail, then release — NOT delete.
    await notify.recoverScheduledSends();

    // Restore the method
    db.deliveries.create = originalCreate;

    // Row should still be present, released back to "pending".
    expect(db._state.scheduledSends).toHaveLength(1);
    expect(db._state.scheduledSends[0]!.id).toBe(row.id);
    expect(db._state.scheduledSends[0]!.status).toBe("pending");
    expect(db._state.scheduledSends[0]!.claimedAt).toBeNull();

    // Retry — this time the provider succeeds.
    await notify.recoverScheduledSends();
    expect(db._state.scheduledSends).toEqual([]);
    const deliveries = await notify.deliveries.list("u1");
    expect(deliveries.some((d) => d.status === "sent")).toBe(true);
  });

  test("recoverScheduledSends ignores future-dated rows", async () => {
    const def = notification({
      id: "alert",
      payload: { msg: "string" },
      channels: [
        channel.email()({ subject: "{{msg}}", body: "{{msg}}" }),
      ],
    });
    const provider = fakeEmailProvider();
    const db = memoryAdapter();
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: db,
      providers: { email: provider },
    });
    await notify.upsertRecipient({ id: "u1", email: "u@x.com" });

    // Insert a row with scheduledFor in the future.
    const future = new Date(Date.now() + 60_000);
    await db.scheduledSends.create({
      recipientId: "u1",
      notificationId: "alert",
      payload: { msg: "later" },
      scheduledFor: future,
      reason: "quiet_hours",
    });

    await notify.recoverScheduledSends();

    // Nothing should have been sent.
    expect(provider.sent).toEqual([]);
    expect(db._state.scheduledSends).toHaveLength(1);
    expect(db._state.scheduledSends[0]!.status).toBe("pending");
  });

  test("claim() is idempotent under concurrent callers", async () => {
    const db = memoryAdapter();
    const row = await db.scheduledSends.create({
      recipientId: "u1",
      notificationId: "n",
      payload: {},
      scheduledFor: new Date(),
      reason: "quiet_hours",
    });
    const winners = await Promise.all([
      db.scheduledSends.claim(row.id),
      db.scheduledSends.claim(row.id),
      db.scheduledSends.claim(row.id),
    ]);
    const wonCount = winners.filter((w) => w !== null).length;
    expect(wonCount).toBe(1);
  });

  test("release() puts a claimed row back into the due pool", async () => {
    const db = memoryAdapter();
    const row = await db.scheduledSends.create({
      recipientId: "u1",
      notificationId: "n",
      payload: {},
      scheduledFor: new Date(Date.now() - 1000),
      reason: "quiet_hours",
    });
    const claimed = await db.scheduledSends.claim(row.id);
    expect(claimed).not.toBeNull();
    let due = await db.scheduledSends.listDue(new Date());
    expect(due).toHaveLength(0);

    await db.scheduledSends.release(row.id);
    due = await db.scheduledSends.listDue(new Date());
    expect(due).toHaveLength(1);
    expect(due[0]!.status).toBe("pending");
  });
});
