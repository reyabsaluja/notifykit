import { describe, expect, test } from "bun:test";
import {
  channel,
  createNotifyKit,
  fakeEmailProvider,
  memoryAdapter,
  notification,
} from "../src/index.js";

const inbox = channel.inbox();

// Shared across tests — defined once for clarity
const commentNotif = notification({
  id: "comment_mentioned",
  payload: {
    actorName: "string",
    postTitle: "string",
    count: "number",
  },
  channels: [
    inbox({
      title: "{{count}} new comment(s) on {{postTitle}}",
      body: "Most recent by {{actorName}}",
    }),
  ],
  digest: {
    windowMs: 50,
    key: ({ recipientId, payload }) =>
      `${recipientId}:${payload.postTitle}`,
    render: ({ payloads }) => ({
      actorName: payloads[payloads.length - 1]!.actorName,
      postTitle: payloads[0]!.postTitle,
      count: payloads.length,
    }),
  },
});

function buildKit() {
  const db = memoryAdapter();
  const provider = fakeEmailProvider();
  const notify = createNotifyKit({
    notifications: [commentNotif] as const,
    database: db,
    providers: { email: provider },
  });
  return { notify, db, provider };
}

const basePayload = {
  actorName: "Rey",
  postTitle: "Launch Plan",
  count: 1,
};

describe("digests", () => {
  test("first send buffers without creating records", async () => {
    const { notify, db } = buildKit();
    await notify.upsertRecipient({ id: "u1" });

    const result = await notify.send({
      recipientId: "u1",
      notificationId: "comment_mentioned",
      payload: basePayload,
    });

    expect(result.digested).toBe(true);
    expect(result.notification).toBeNull();
    expect(result.inboxItems).toEqual([]);
    expect(db._state.inboxItems).toEqual([]);
    expect(db._state.notifications).toEqual([]);
    expect(db._state.digests).toHaveLength(1);
    expect(db._state.digests[0]!.payloads).toHaveLength(1);
  });

  test("multiple sends within the window are merged into one bucket", async () => {
    const { notify, db } = buildKit();
    await notify.upsertRecipient({ id: "u1" });

    for (let i = 0; i < 3; i++) {
      await notify.send({
        recipientId: "u1",
        notificationId: "comment_mentioned",
        payload: { ...basePayload, actorName: `actor_${i}` },
      });
    }
    expect(db._state.digests).toHaveLength(1);
    expect(db._state.digests[0]!.payloads).toHaveLength(3);
    expect(db._state.inboxItems).toEqual([]);
  });

  test("different keys produce separate buckets", async () => {
    const { notify, db } = buildKit();
    await notify.upsertRecipient({ id: "u1" });

    await notify.send({
      recipientId: "u1",
      notificationId: "comment_mentioned",
      payload: { ...basePayload, postTitle: "Post A" },
    });
    await notify.send({
      recipientId: "u1",
      notificationId: "comment_mentioned",
      payload: { ...basePayload, postTitle: "Post B" },
    });

    expect(db._state.digests).toHaveLength(2);
    expect(
      db._state.digests.map((d) => d.payloads.length).sort(),
    ).toEqual([1, 1]);
  });

  test("flush fires after the window and emits merged payload", async () => {
    const { notify, db } = buildKit();
    await notify.upsertRecipient({ id: "u1" });

    for (const name of ["Alice", "Bob", "Carol"]) {
      await notify.send({
        recipientId: "u1",
        notificationId: "comment_mentioned",
        payload: { ...basePayload, actorName: name },
      });
    }

    await notify.drain();

    expect(db._state.digests).toEqual([]);
    expect(db._state.inboxItems).toHaveLength(1);
    const item = db._state.inboxItems[0]!;
    expect(item.title).toBe("3 new comment(s) on Launch Plan");
    expect(item.body).toBe("Most recent by Carol");
  });

  test("flushDigests() forces immediate flush", async () => {
    const longWindow = notification({
      id: "slow",
      payload: { n: "number" },
      channels: [inbox({ title: "{{n}}" })],
      digest: {
        windowMs: 60_000, // would never fire in this test
        render: ({ count }) => ({ n: count }),
      },
    });
    const db = memoryAdapter();
    const notify = createNotifyKit({
      notifications: [longWindow] as const,
      database: db,
      providers: { email: fakeEmailProvider() },
    });
    await notify.upsertRecipient({ id: "u1" });

    for (let i = 0; i < 5; i++) {
      await notify.send({
        recipientId: "u1",
        notificationId: "slow",
        payload: { n: i },
      });
    }

    expect(db._state.digests).toHaveLength(1);
    expect(db._state.inboxItems).toEqual([]);

    await notify.flushDigests();

    expect(db._state.digests).toEqual([]);
    expect(db._state.inboxItems).toHaveLength(1);
    expect(db._state.inboxItems[0]!.title).toBe("5");
  });

  test("window is tumbling — appends don't extend flushAt", async () => {
    const { notify, db } = buildKit();
    await notify.upsertRecipient({ id: "u1" });

    await notify.send({
      recipientId: "u1",
      notificationId: "comment_mentioned",
      payload: basePayload,
    });
    const originalFlushAt = db._state.digests[0]!.flushAt.getTime();

    // second send into the same bucket
    await notify.send({
      recipientId: "u1",
      notificationId: "comment_mentioned",
      payload: basePayload,
    });
    expect(db._state.digests[0]!.flushAt.getTime()).toBe(originalFlushAt);
  });

  test("notifications without digest still deliver immediately", async () => {
    const immediate = notification({
      id: "alert",
      payload: { msg: "string" },
      channels: [inbox({ title: "{{msg}}" })],
    });
    const db = memoryAdapter();
    const notify = createNotifyKit({
      notifications: [immediate] as const,
      database: db,
      providers: { email: fakeEmailProvider() },
    });
    await notify.upsertRecipient({ id: "u1" });

    const result = await notify.send({
      recipientId: "u1",
      notificationId: "alert",
      payload: { msg: "Hi" },
    });
    expect(result.digested).toBe(false);
    expect(result.notification).not.toBeNull();
    expect(result.inboxItems).toHaveLength(1);
    expect(db._state.digests).toEqual([]);
  });

  test("flushed notification respects preferences", async () => {
    const withEmail = notification({
      id: "mentioned",
      payload: { actorName: "string", count: "number" },
      channels: [
        inbox({ title: "{{count}} from {{actorName}}" }),
        channel.email()({
          subject: "{{count}} updates",
          body: "Latest from {{actorName}}",
        }),
      ],
      digest: {
        windowMs: 30,
        render: ({ payloads }) => ({
          actorName: payloads[payloads.length - 1]!.actorName,
          count: payloads.length,
        }),
      },
    });
    const provider = fakeEmailProvider();
    const db = memoryAdapter();
    const notify = createNotifyKit({
      notifications: [withEmail] as const,
      database: db,
      providers: { email: provider },
    });
    await notify.upsertRecipient({ id: "u1", email: "u@x.com" });
    await notify.preferences.update({
      recipientId: "u1",
      notificationId: "mentioned",
      channels: { email: false },
    });

    await notify.send({
      recipientId: "u1",
      notificationId: "mentioned",
      payload: { actorName: "Rey", count: 1 },
    });
    await notify.send({
      recipientId: "u1",
      notificationId: "mentioned",
      payload: { actorName: "Ada", count: 1 },
    });

    await notify.drain();

    expect(db._state.inboxItems).toHaveLength(1);
    expect(db._state.inboxItems[0]!.title).toBe("2 from Ada");
    expect(provider.sent).toHaveLength(0);
    expect(db._state.deliveries).toEqual([]);
  });

  test("drain() without pending flushes resolves", async () => {
    const { notify } = buildKit();
    await notify.drain();
    expect(true).toBe(true);
  });

  test("render() returning an invalid payload reports the error and preserves the bucket", async () => {
    const broken = notification({
      id: "bad",
      payload: { count: "number" },
      channels: [inbox({ title: "{{count}}" })],
      digest: {
        windowMs: 10,
        render: () => ({ count: "not a number" as unknown as number }),
      },
    });
    const db = memoryAdapter();
    const notify = createNotifyKit({
      notifications: [broken] as const,
      database: db,
      providers: { email: fakeEmailProvider() },
    });
    await notify.upsertRecipient({ id: "u1" });
    await notify.send({
      recipientId: "u1",
      notificationId: "bad",
      payload: { count: 1 },
    });
    await expect(notify.flushDigests()).rejects.toThrow(
      /Expected "count" to be number/,
    );
    // Inbox should be empty because validation failed
    expect(db._state.inboxItems).toEqual([]);
    // Bucket stays recoverable for inspection or retry.
    expect(db._state.digests).toHaveLength(1);
    expect(db._state.digests[0]!.payloads).toEqual([{ count: 1 }]);
  });

  test("close() cancels pending digest timers without flushing", async () => {
    const { notify, db, provider } = buildKit();
    await notify.upsertRecipient({ id: "u1", email: "u1@test.local" });
    await notify.send({
      recipientId: "u1",
      notificationId: "comment_mentioned",
      payload: { actorName: "Alice", postTitle: "Hello", count: 1 },
    });
    // close before the timer fires
    await notify.close();
    // Nothing should have been delivered
    expect(db._state.inboxItems).toHaveLength(0);
    expect(provider.sent).toHaveLength(0);
    // Digest bucket still has the buffered payload
    expect(db._state.digests).toHaveLength(1);
  });
});
