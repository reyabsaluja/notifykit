import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import {
  channel,
  createNotifyKit,
  fakeEmailProvider,
  notification,
} from "notifykit";

import { createSqliteTables, drizzleSqliteAdapter } from "../src/index.js";

const inbox = channel.inbox();
const email = channel.email();

describe("drizzle: rate limit atomicity", () => {
  test("concurrent sends to the same key cap at max", async () => {
    const def = notification({
      id: "alert",
      payload: { msg: "string" },
      channels: [inbox({ title: "{{msg}}" })],
      rateLimit: { max: 3, windowMs: 5_000 },
    });
    const sqlite = new Database(":memory:");
    const db = drizzle(sqlite);
    await createSqliteTables(db);
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: drizzleSqliteAdapter(db),
      providers: { email: fakeEmailProvider() },
    });
    await notify.upsertRecipient({ id: "u1" });

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
    expect(allowed).toBe(3);

    const count = sqlite
      .query("SELECT COUNT(*) as n FROM notifykit_rate_limit_events")
      .get() as { n: number };
    expect(count.n).toBe(3);
  });
});

describe("drizzle: digest append under contention", () => {
  test("every concurrent payload is preserved in the bucket", async () => {
    const def = notification({
      id: "digested",
      payload: { msg: "string" },
      channels: [inbox({ title: "x" })],
      digest: {
        windowMs: 60_000,
        render: ({ payloads }) => ({
          msg: String(payloads.length),
        }),
      },
    });
    const sqlite = new Database(":memory:");
    const db = drizzle(sqlite);
    await createSqliteTables(db);
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: drizzleSqliteAdapter(db),
      providers: { email: fakeEmailProvider() },
    });
    await notify.upsertRecipient({ id: "u1" });

    // Fire 25 sends concurrently. They should all end up in the same digest
    // bucket with no lost payloads.
    const N = 25;
    await Promise.all(
      Array.from({ length: N }, (_, i) =>
        notify.send({
          recipientId: "u1",
          notificationId: "digested",
          payload: { msg: `p_${i}` },
        }),
      ),
    );

    const buckets = sqlite
      .query<{ payloads: string }, []>(
        "SELECT payloads FROM notifykit_digest_buffers",
      )
      .all();
    expect(buckets).toHaveLength(1);
    const payloads = JSON.parse(buckets[0]!.payloads) as Array<{ msg: string }>;
    expect(payloads).toHaveLength(N);
    // Check every unique payload made it through (order doesn't matter).
    const seen = new Set(payloads.map((p) => p.msg));
    expect(seen.size).toBe(N);
  });
});

describe("drizzle: scheduled send lifecycle", () => {
  test("claim() is atomic — only one worker wins", async () => {
    const sqlite = new Database(":memory:");
    const db = drizzle(sqlite);
    await createSqliteTables(db);
    const adapter = drizzleSqliteAdapter(db);
    const row = await adapter.scheduledSends.create({
      recipientId: "u1",
      notificationId: "n",
      payload: {},
      scheduledFor: new Date(),
      reason: "quiet_hours",
    });
    const winners = await Promise.all([
      adapter.scheduledSends.claim(row.id),
      adapter.scheduledSends.claim(row.id),
      adapter.scheduledSends.claim(row.id),
    ]);
    expect(winners.filter((w) => w !== null)).toHaveLength(1);
  });

  test("listDue excludes future-dated and claimed rows", async () => {
    const sqlite = new Database(":memory:");
    const db = drizzle(sqlite);
    await createSqliteTables(db);
    const adapter = drizzleSqliteAdapter(db);

    const past = await adapter.scheduledSends.create({
      recipientId: "u1",
      notificationId: "n",
      payload: {},
      scheduledFor: new Date(Date.now() - 5_000),
      reason: "quiet_hours",
    });
    await adapter.scheduledSends.create({
      recipientId: "u1",
      notificationId: "n",
      payload: {},
      scheduledFor: new Date(Date.now() + 60_000),
      reason: "quiet_hours",
    });

    let due = await adapter.scheduledSends.listDue(new Date());
    expect(due.map((r) => r.id)).toEqual([past.id]);

    await adapter.scheduledSends.claim(past.id);
    due = await adapter.scheduledSends.listDue(new Date());
    expect(due).toEqual([]);
  });

  test("release() makes a claimed row due again", async () => {
    const sqlite = new Database(":memory:");
    const db = drizzle(sqlite);
    await createSqliteTables(db);
    const adapter = drizzleSqliteAdapter(db);
    const row = await adapter.scheduledSends.create({
      recipientId: "u1",
      notificationId: "n",
      payload: {},
      scheduledFor: new Date(Date.now() - 1000),
      reason: "quiet_hours",
    });
    await adapter.scheduledSends.claim(row.id);
    expect((await adapter.scheduledSends.listDue(new Date()))).toEqual([]);
    await adapter.scheduledSends.release(row.id);
    const due = await adapter.scheduledSends.listDue(new Date());
    expect(due).toHaveLength(1);
  });

  test("complete() removes the row", async () => {
    const sqlite = new Database(":memory:");
    const db = drizzle(sqlite);
    await createSqliteTables(db);
    const adapter = drizzleSqliteAdapter(db);
    const row = await adapter.scheduledSends.create({
      recipientId: "u1",
      notificationId: "n",
      payload: {},
      scheduledFor: new Date(),
      reason: "quiet_hours",
    });
    await adapter.scheduledSends.claim(row.id);
    await adapter.scheduledSends.complete(row.id);
    expect(await adapter.scheduledSends.list()).toEqual([]);
  });

  test("recoverScheduledSends sends past-due but not future rows", async () => {
    const def = notification({
      id: "alert",
      payload: { msg: "string" },
      channels: [email({ subject: "{{msg}}", body: "{{msg}}" })],
    });
    const sqlite = new Database(":memory:");
    const db = drizzle(sqlite);
    await createSqliteTables(db);
    const adapter = drizzleSqliteAdapter(db);
    const provider = fakeEmailProvider();
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: adapter,
      providers: { email: provider },
    });
    await notify.upsertRecipient({ id: "u1", email: "u@x.com" });

    await adapter.scheduledSends.create({
      recipientId: "u1",
      notificationId: "alert",
      payload: { msg: "past" },
      scheduledFor: new Date(Date.now() - 1_000),
      reason: "quiet_hours",
    });
    await adapter.scheduledSends.create({
      recipientId: "u1",
      notificationId: "alert",
      payload: { msg: "future" },
      scheduledFor: new Date(Date.now() + 60_000),
      reason: "quiet_hours",
    });

    await notify.recoverScheduledSends();

    expect(provider.sent).toHaveLength(1);
    expect(provider.sent[0]!.subject).toBe("past");

    // Future row still pending.
    const remaining = await adapter.scheduledSends.list();
    expect(remaining).toHaveLength(1);
    expect(remaining[0]!.status).toBe("pending");
  });
});
