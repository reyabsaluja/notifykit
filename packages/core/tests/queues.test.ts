import { describe, expect, test } from "bun:test";
import {
  channel,
  createNotifyKit,
  inlineQueue,
  memoryAdapter,
  notification,
  setTimeoutQueue,
} from "../src/index.js";
import type { EmailProvider, Queue } from "../src/index.js";

const inbox = channel.inbox();
const email = channel.email();

const commentMentioned = notification({
  id: "comment_mentioned",
  payload: {
    actorName: "string",
    postTitle: "string",
    postUrl: "string",
  },
  channels: [
    inbox({
      title: "{{actorName}} mentioned you",
      body: "In {{postTitle}}",
      actionUrl: "{{postUrl}}",
    }),
    email({
      subject: "Hi {{actorName}}",
      body: "{{postUrl}}",
    }),
  ],
});

function makeFlakyProvider(failUntilAttempt: number): EmailProvider & {
  attempts: number;
} {
  let attempts = 0;
  const provider = {
    id: "flaky",
    attempts: 0,
    async send() {
      attempts++;
      provider.attempts = attempts;
      if (attempts < failUntilAttempt) {
        throw new Error(`flaky attempt ${attempts}`);
      }
      return { providerMessageId: `flaky_${attempts}` };
    },
  };
  return provider;
}

const basePayload = {
  actorName: "Rey",
  postTitle: "Plan",
  postUrl: "/p",
};

describe("retries", () => {
  test("retries the configured number of times and eventually succeeds", async () => {
    const provider = makeFlakyProvider(3);
    const notify = createNotifyKit({
      notifications: [commentMentioned] as const,
      database: memoryAdapter(),
      providers: { email: provider },
      retry: { maxAttempts: 3, delayMs: () => 0 },
    });
    await notify.upsertRecipient({
      id: "u1",
      email: "u@x.com",
    });
    const result = await notify.send({
      recipientId: "u1",
      notificationId: "comment_mentioned",
      payload: basePayload,
    });
    expect(provider.attempts).toBe(3);
    expect(result.deliveries[0]!.status).toBe("sent");
    expect(result.deliveries[0]!.attempts).toBe(3);
    expect(result.deliveries[0]!.error).toBeUndefined();
  });

  test("stops retrying after maxAttempts and marks failed", async () => {
    const provider = makeFlakyProvider(99);
    const notify = createNotifyKit({
      notifications: [commentMentioned] as const,
      database: memoryAdapter(),
      providers: { email: provider },
      retry: { maxAttempts: 2, delayMs: () => 0 },
    });
    await notify.upsertRecipient({
      id: "u1",
      email: "u@x.com",
    });
    const result = await notify.send({
      recipientId: "u1",
      notificationId: "comment_mentioned",
      payload: basePayload,
    });
    expect(provider.attempts).toBe(2);
    expect(result.deliveries[0]!.status).toBe("failed");
    expect(result.deliveries[0]!.attempts).toBe(2);
    expect(result.deliveries[0]!.error).toMatch(/flaky attempt 2/);
  });

  test("permanent provider errors stop retries and record actual attempts", async () => {
    let attempts = 0;
    const provider: EmailProvider = {
      id: "permanent",
      async send() {
        attempts++;
        const err = new Error("bad request") as Error & { permanent: boolean };
        err.permanent = true;
        throw err;
      },
    };
    const notify = createNotifyKit({
      notifications: [commentMentioned] as const,
      database: memoryAdapter(),
      providers: { email: provider },
      retry: { maxAttempts: 3, delayMs: () => 0 },
    });
    await notify.upsertRecipient({ id: "u1", email: "u@x.com" });

    const result = await notify.send({
      recipientId: "u1",
      notificationId: "comment_mentioned",
      payload: basePayload,
    });
    const timeline = await notify.timeline(result.notification!.id);
    const failed = timeline.find((event) => event.event === "delivery.failed");

    expect(attempts).toBe(1);
    expect(result.deliveries[0]!.attempts).toBe(1);
    expect(failed?.message).toContain("after 1 attempt");
    expect(failed?.metadata?.attempts).toBe(1);
  });

  test("delayMs receives the 1-indexed attempt number (skipped for first attempt)", async () => {
    const calls: number[] = [];
    const provider = makeFlakyProvider(99);
    const notify = createNotifyKit({
      notifications: [commentMentioned] as const,
      database: memoryAdapter(),
      providers: { email: provider },
      retry: {
        maxAttempts: 3,
        delayMs: (attempt) => {
          calls.push(attempt);
          return 0;
        },
      },
    });
    await notify.upsertRecipient({ id: "u1", email: "u@x.com" });
    await notify.send({
      recipientId: "u1",
      notificationId: "comment_mentioned",
      payload: basePayload,
    });
    expect(calls).toEqual([2, 3]);
  });

  test("invalid retry delays fail the delivery without extra provider attempts", async () => {
    const provider = makeFlakyProvider(99);
    const notify = createNotifyKit({
      notifications: [commentMentioned] as const,
      database: memoryAdapter(),
      providers: { email: provider },
      retry: {
        maxAttempts: 3,
        delayMs: () => Number.NaN,
      },
    });
    await notify.upsertRecipient({ id: "u1", email: "u@x.com" });

    const result = await notify.send({
      recipientId: "u1",
      notificationId: "comment_mentioned",
      payload: basePayload,
    });

    expect(provider.attempts).toBe(1);
    expect(result.deliveries[0]!.status).toBe("failed");
    expect(result.deliveries[0]!.attempts).toBe(1);
    expect(result.deliveries[0]!.error).toMatch(/retry\.delayMs\(2\).*non-negative finite number/);
  });

  test("throwing retry delay functions fail the delivery without extra provider attempts", async () => {
    const provider = makeFlakyProvider(99);
    const notify = createNotifyKit({
      notifications: [commentMentioned] as const,
      database: memoryAdapter(),
      providers: { email: provider },
      retry: {
        maxAttempts: 3,
        delayMs: () => {
          throw new Error("bad delay");
        },
      },
    });
    await notify.upsertRecipient({ id: "u1", email: "u@x.com" });

    const result = await notify.send({
      recipientId: "u1",
      notificationId: "comment_mentioned",
      payload: basePayload,
    });

    expect(provider.attempts).toBe(1);
    expect(result.deliveries[0]!.status).toBe("failed");
    expect(result.deliveries[0]!.attempts).toBe(1);
    expect(result.deliveries[0]!.error).toMatch(/retry\.delayMs\(2\) threw: bad delay/);
  });

  test("delivery.failed hook fires exactly once", async () => {
    const events: string[] = [];
    const provider = makeFlakyProvider(99);
    const notify = createNotifyKit({
      notifications: [commentMentioned] as const,
      database: memoryAdapter(),
      providers: { email: provider },
      retry: { maxAttempts: 3, delayMs: () => 0 },
      on: {
        "delivery.failed": () => void events.push("failed"),
        "delivery.sent": () => void events.push("sent"),
      },
    });
    await notify.upsertRecipient({ id: "u1", email: "u@x.com" });
    await notify.send({
      recipientId: "u1",
      notificationId: "comment_mentioned",
      payload: basePayload,
    });
    expect(events).toEqual(["failed"]);
  });

  test("delivery.sent fires once after a successful retry", async () => {
    const events: string[] = [];
    const provider = makeFlakyProvider(2);
    const notify = createNotifyKit({
      notifications: [commentMentioned] as const,
      database: memoryAdapter(),
      providers: { email: provider },
      retry: { maxAttempts: 3, delayMs: () => 0 },
      on: {
        "delivery.sent": ({ delivery }) =>
          void events.push(`sent:${delivery.attempts}`),
        "delivery.failed": () => void events.push("failed"),
      },
    });
    await notify.upsertRecipient({ id: "u1", email: "u@x.com" });
    await notify.send({
      recipientId: "u1",
      notificationId: "comment_mentioned",
      payload: basePayload,
    });
    expect(events).toEqual(["sent:2"]);
  });
});

describe("queues", () => {
  test("setTimeoutQueue returns from send() before delivery completes", async () => {
    const provider = makeFlakyProvider(1);
    const notify = createNotifyKit({
      notifications: [commentMentioned] as const,
      database: memoryAdapter(),
      providers: { email: provider },
      queue: setTimeoutQueue(),
      retry: { maxAttempts: 1, delayMs: () => 0 },
    });
    await notify.upsertRecipient({ id: "u1", email: "u@x.com" });
    const result = await notify.send({
      recipientId: "u1",
      notificationId: "comment_mentioned",
      payload: basePayload,
    });
    // Inbox still delivers synchronously.
    expect(result.inboxItems).toHaveLength(1);
    // Email is still pending at return time.
    expect(result.deliveries[0]!.status).toBe("pending");
    expect(provider.attempts).toBe(0);

    await notify.drain();

    const refreshed = await notify.deliveries.list("u1");
    expect(refreshed[0]!.status).toBe("sent");
  });

  test("inlineQueue waits for delivery before send() returns", async () => {
    const provider = makeFlakyProvider(1);
    const notify = createNotifyKit({
      notifications: [commentMentioned] as const,
      database: memoryAdapter(),
      providers: { email: provider },
      queue: inlineQueue(),
    });
    await notify.upsertRecipient({ id: "u1", email: "u@x.com" });
    const result = await notify.send({
      recipientId: "u1",
      notificationId: "comment_mentioned",
      payload: basePayload,
    });
    expect(result.deliveries[0]!.status).toBe("sent");
    expect(provider.attempts).toBe(1);
  });

  test("custom queue implementation is called with the job and worker", async () => {
    const provider = makeFlakyProvider(1);
    const observed: string[] = [];
    const customQueue: Queue = {
      async enqueue(job, run) {
        observed.push(`enqueued:${job.deliveryId}`);
        await run(job);
        observed.push(`ran:${job.deliveryId}`);
      },
      async drain() {},
    };
    const notify = createNotifyKit({
      notifications: [commentMentioned] as const,
      database: memoryAdapter(),
      providers: { email: provider },
      queue: customQueue,
      retry: { maxAttempts: 1, delayMs: () => 0 },
    });
    await notify.upsertRecipient({ id: "u1", email: "u@x.com" });
    await notify.send({
      recipientId: "u1",
      notificationId: "comment_mentioned",
      payload: basePayload,
    });
    expect(observed).toHaveLength(2);
    expect(observed[0]).toMatch(/^enqueued:dlv_/);
    expect(observed[1]).toMatch(/^ran:dlv_/);
  });

  test("drain() resolves even when there are no jobs", async () => {
    const notify = createNotifyKit({
      notifications: [commentMentioned] as const,
      database: memoryAdapter(),
      providers: { email: { id: "x", async send() { return {}; } } },
      queue: setTimeoutQueue(),
    });
    await notify.drain();
    expect(true).toBe(true);
  });
});
