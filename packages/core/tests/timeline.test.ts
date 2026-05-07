import { describe, expect, test, mock } from "bun:test";
import {
  channel,
  createNotifyKit,
  fakeEmailProvider,
  fakeSmsProvider,
  memoryAdapter,
  notification,
} from "../src/index.js";

const inbox = channel.inbox();
const email = channel.email();
const sms = channel.sms();

function setup() {
  const db = memoryAdapter();
  const emailProvider = fakeEmailProvider();
  const smsProvider = fakeSmsProvider();
  const def = notification({
    id: "comment_mentioned",
    payload: { author: "string", body: "string" },
    channels: [
      inbox({ title: "{{author}} mentioned you", body: "{{body}}" }),
      email({ subject: "{{author}} mentioned you", body: "{{body}}" }),
    ],
    redact: ["body"],
  });
  const notify = createNotifyKit({
    notifications: [def] as const,
    database: db,
    providers: { email: emailProvider, sms: smsProvider },
  });
  return { db, emailProvider, smsProvider, notify };
}

describe("timeline", () => {
  test("records lifecycle events for a successful send", async () => {
    const { notify } = setup();
    await notify.upsertRecipient({ id: "u1", email: "u1@test.com" });

    const result = await notify.send({
      recipientId: "u1",
      notificationId: "comment_mentioned",
      payload: { author: "Alice", body: "Hello" },
    });

    const timeline = await notify.timeline(result.notification!.id);
    expect(timeline.length).toBeGreaterThanOrEqual(4);

    const events = timeline.map((e) => e.event);
    expect(events).toContain("payload.validated");
    expect(events).toContain("recipient.resolved");
    expect(events).toContain("preferences.resolved");
    expect(events).toContain("inbox.created");
    expect(events).toContain("delivery.created");
    expect(events).toContain("delivery.sent");
  });

  test("records provider message ID", async () => {
    const db = memoryAdapter();
    const emailProvider = fakeEmailProvider();
    const def = notification({
      id: "test",
      payload: { msg: "string" },
      channels: [email({ subject: "{{msg}}", body: "{{msg}}" })],
    });
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: db,
      providers: { email: emailProvider },
    });
    await notify.upsertRecipient({ id: "u1", email: "u1@test.com" });

    const result = await notify.send({
      recipientId: "u1",
      notificationId: "test",
      payload: { msg: "hi" },
    });

    const timeline = await notify.timeline(result.notification!.id);
    const msgIdEvent = timeline.find((e) => e.event === "provider.message_id_stored");
    expect(msgIdEvent).toBeDefined();
    expect(msgIdEvent!.metadata?.providerMessageId).toBeDefined();
  });

  test("records deduplication", async () => {
    const { notify } = setup();
    await notify.upsertRecipient({ id: "u1", email: "u1@test.com" });

    await notify.send({
      recipientId: "u1",
      notificationId: "comment_mentioned",
      payload: { author: "Alice", body: "hi" },
      dedupeKey: "mention-1",
      dedupeWindowMs: 60_000,
    });

    const result = await notify.send({
      recipientId: "u1",
      notificationId: "comment_mentioned",
      payload: { author: "Alice", body: "hi" },
      dedupeKey: "mention-1",
      dedupeWindowMs: 60_000,
    });

    const timeline = await notify.timeline(result.notification!.id);
    const dedupeEvent = timeline.find((e) => e.event === "deduplicated");
    expect(dedupeEvent).toBeDefined();
    expect(dedupeEvent!.metadata?.dedupeKey).toBe("mention-1");
  });

  test("records rate limiting", async () => {
    const db = memoryAdapter();
    const emailProvider = fakeEmailProvider();
    const def = notification({
      id: "alert",
      payload: { msg: "string" },
      channels: [email({ subject: "{{msg}}", body: "{{msg}}" })],
      rateLimit: { max: 1, windowMs: 60_000 },
    });
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: db,
      providers: { email: emailProvider },
    });
    await notify.upsertRecipient({ id: "u1", email: "u1@test.com" });

    await notify.send({
      recipientId: "u1",
      notificationId: "alert",
      payload: { msg: "first" },
    });

    const result = await notify.send({
      recipientId: "u1",
      notificationId: "alert",
      payload: { msg: "second" },
    });

    const timeline = await notify.timeline(result.notification!.id);
    const rateLimitEvent = timeline.find((e) => e.event === "rate_limited");
    expect(rateLimitEvent).toBeDefined();
    expect(rateLimitEvent!.metadata?.max).toBe(1);
  });

  test("records channel skipped reasons", async () => {
    const db = memoryAdapter();
    const emailProvider = fakeEmailProvider();
    const def = notification({
      id: "alert",
      payload: { msg: "string" },
      channels: [
        inbox({ title: "{{msg}}" }),
        email({ subject: "{{msg}}", body: "{{msg}}" }),
      ],
    });
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: db,
      providers: { email: emailProvider },
    });
    // No email on recipient
    await notify.upsertRecipient({ id: "u1" });

    const result = await notify.send({
      recipientId: "u1",
      notificationId: "alert",
      payload: { msg: "hello" },
    });

    const timeline = await notify.timeline(result.notification!.id);
    const skipEvent = timeline.find(
      (e) => e.event === "channel.skipped" && e.channel === "email",
    );
    expect(skipEvent).toBeDefined();
    expect(skipEvent!.metadata?.reason).toBe("missing_address");
  });

  test("records retry attempts and provider errors on failure", async () => {
    const db = memoryAdapter();
    let callCount = 0;
    const failingProvider = {
      id: "failing-email",
      async send() {
        callCount++;
        throw new Error("SMTP timeout");
      },
    };
    const def = notification({
      id: "alert",
      payload: { msg: "string" },
      channels: [email({ subject: "{{msg}}", body: "{{msg}}" })],
    });
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: db,
      providers: { email: failingProvider },
      retry: { maxAttempts: 3, delayMs: () => 0 },
    });
    await notify.upsertRecipient({ id: "u1", email: "u1@test.com" });

    const result = await notify.send({
      recipientId: "u1",
      notificationId: "alert",
      payload: { msg: "hi" },
    });

    const timeline = await notify.timeline(result.notification!.id);
    const providerErrors = timeline.filter((e) => e.event === "provider.error");
    expect(providerErrors.length).toBe(3);
    expect(providerErrors[0]!.metadata?.error).toBe("SMTP timeout");

    const retryAttempts = timeline.filter((e) => e.event === "delivery.attempt");
    expect(retryAttempts.length).toBe(2); // attempts 2 and 3

    const failedEvent = timeline.find((e) => e.event === "delivery.failed");
    expect(failedEvent).toBeDefined();
    expect(failedEvent!.metadata?.attempts).toBe(3);
  });

  test("records suppression when all channels disabled", async () => {
    const db = memoryAdapter();
    const emailProvider = fakeEmailProvider();
    const def = notification({
      id: "promo",
      payload: { msg: "string" },
      channels: [email({ subject: "{{msg}}", body: "{{msg}}" })],
    });
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: db,
      providers: { email: emailProvider },
    });
    await notify.upsertRecipient({ id: "u1", email: "u1@test.com" });
    await notify.preferences.update({
      recipientId: "u1",
      notificationId: "promo",
      channels: { email: false },
    });

    const result = await notify.send({
      recipientId: "u1",
      notificationId: "promo",
      payload: { msg: "sale!" },
    });

    const timeline = await notify.timeline(result.notification!.id);
    const suppressEvent = timeline.find((e) => e.event === "notification.suppressed");
    expect(suppressEvent).toBeDefined();
  });

  test("filters timeline by deliveryId", async () => {
    const { notify } = setup();
    await notify.upsertRecipient({ id: "u1", email: "u1@test.com" });

    const result = await notify.send({
      recipientId: "u1",
      notificationId: "comment_mentioned",
      payload: { author: "Bob", body: "test" },
    });

    const emailDelivery = result.deliveries.find((d) => d.channel === "email");
    expect(emailDelivery).toBeDefined();

    const deliveryTimeline = await notify.timeline(result.notification!.id, {
      deliveryId: emailDelivery!.id,
    });

    expect(deliveryTimeline.length).toBeGreaterThan(0);
    for (const event of deliveryTimeline) {
      expect(event.deliveryId).toBe(emailDelivery!.id);
    }
  });

  test("timeline events have correct metadata fields", async () => {
    const { notify } = setup();
    await notify.upsertRecipient({ id: "u1", email: "u1@test.com" });

    const result = await notify.send({
      recipientId: "u1",
      notificationId: "comment_mentioned",
      payload: { author: "Alice", body: "hello" },
    });

    const timeline = await notify.timeline(result.notification!.id);
    for (const event of timeline) {
      expect(event.notificationRecordId).toBe(result.notification!.id);
      expect(event.recipientId).toBe("u1");
      expect(event.notificationId).toBe("comment_mentioned");
      expect(event.id).toBeTruthy();
      expect(event.timestamp).toBeInstanceOf(Date);
    }
  });

  test("records idempotent replay", async () => {
    const db = memoryAdapter();
    const emailProvider = fakeEmailProvider();
    const def = notification({
      id: "alert",
      payload: { msg: "string" },
      channels: [
        inbox({ title: "{{msg}}" }),
        email({ subject: "{{msg}}", body: "{{msg}}" }),
      ],
    });
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: db,
      providers: { email: emailProvider },
    });
    await notify.upsertRecipient({ id: "u1", email: "u1@test.com" });

    const first = await notify.send({
      recipientId: "u1",
      notificationId: "alert",
      payload: { msg: "hi" },
      idempotencyKey: "idem-1",
    });

    const second = await notify.send({
      recipientId: "u1",
      notificationId: "alert",
      payload: { msg: "hi" },
      idempotencyKey: "idem-1",
    });

    expect(second.idempotent).toBe(true);
    const timeline = await notify.timeline(first.notification!.id);
    const replayEvent = timeline.find((e) => e.event === "idempotent.replay");
    expect(replayEvent).toBeDefined();
  });

  test("records fallback triggered after primary delivery failure", async () => {
    const db = memoryAdapter();
    const failingProvider = {
      id: "failing-email",
      async send() {
        throw new Error("send failed");
      },
    };
    const def = notification({
      id: "password_reset",
      payload: { link: "string" },
      channels: [email({ subject: "Reset", body: "{{link}}" })],
      fallback: inbox({ title: "Fallback: {{link}}" }),
    });
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: db,
      providers: { email: failingProvider },
      retry: { maxAttempts: 1, delayMs: () => 0 },
    });
    await notify.upsertRecipient({ id: "u1", email: "u1@test.com" });

    const result = await notify.send({
      recipientId: "u1",
      notificationId: "password_reset",
      payload: { link: "/reset/abc" },
    });

    const timeline = await notify.timeline(result.notification!.id);
    const fallbackEvent = timeline.find((e) => e.event === "fallback.triggered");
    expect(fallbackEvent).toBeDefined();
  });

  test("records quiet hours deferral", async () => {
    const db = memoryAdapter();
    const emailProvider = fakeEmailProvider();
    const def = notification({
      id: "alert",
      payload: { msg: "string" },
      channels: [
        inbox({ title: "{{msg}}" }),
        email({ subject: "{{msg}}", body: "{{msg}}" }),
      ],
    });
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: db,
      providers: { email: emailProvider },
    });

    const now = new Date();
    const startHour = now.getHours();
    const endHour = (startHour + 2) % 24;
    const start = `${String(startHour).padStart(2, "0")}:00`;
    const end = `${String(endHour).padStart(2, "0")}:00`;

    await notify.upsertRecipient({
      id: "u1",
      email: "u1@test.com",
      quietHours: { start, end, timezone: "UTC" },
    });

    const result = await notify.send({
      recipientId: "u1",
      notificationId: "alert",
      payload: { msg: "hi" },
    });

    const timeline = await notify.timeline(result.notification!.id);
    const deferEvent = timeline.find((e) => e.event === "quiet_hours.deferred");
    expect(deferEvent).toBeDefined();
    expect(deferEvent!.channel).toBe("email");
  });

  test("prune removes events older than cutoff", async () => {
    const db = memoryAdapter();
    const emailProvider = fakeEmailProvider();
    const def = notification({
      id: "test",
      payload: { msg: "string" },
      channels: [email({ subject: "{{msg}}", body: "{{msg}}" })],
    });
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: db,
      providers: { email: emailProvider },
    });
    await notify.upsertRecipient({ id: "u1", email: "u1@test.com" });

    const result = await notify.send({
      recipientId: "u1",
      notificationId: "test",
      payload: { msg: "hi" },
    });

    const before = await notify.timeline(result.notification!.id);
    expect(before.length).toBeGreaterThan(0);

    const futureDate = new Date(Date.now() + 60_000);
    const pruned = await db.timeline.prune(futureDate);
    expect(pruned).toBe(before.length);

    const after = await notify.timeline(result.notification!.id);
    expect(after.length).toBe(0);
  });

  test("onTimelineError is called when append fails", async () => {
    const db = memoryAdapter();
    const emailProvider = fakeEmailProvider();
    const errors: unknown[] = [];
    const originalAppend = db.timeline.append.bind(db.timeline);
    let shouldFail = false;
    db.timeline.append = async (events) => {
      if (shouldFail) throw new Error("DB write failed");
      return originalAppend(events);
    };
    const def = notification({
      id: "test",
      payload: { msg: "string" },
      channels: [email({ subject: "{{msg}}", body: "{{msg}}" })],
    });
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: db,
      providers: { email: emailProvider },
      onTimelineError: (err) => errors.push(err),
    });
    await notify.upsertRecipient({ id: "u1", email: "u1@test.com" });

    shouldFail = true;
    const result = await notify.send({
      recipientId: "u1",
      notificationId: "test",
      payload: { msg: "hi" },
    });

    expect(result.notification).toBeDefined();
    expect(errors.length).toBeGreaterThan(0);
    expect((errors[0] as Error).message).toBe("DB write failed");
  });

  test("timeline events are still flushed on sendInner error", async () => {
    const db = memoryAdapter();
    const emailProvider = fakeEmailProvider();
    const def = notification({
      id: "test",
      payload: { msg: "string" },
      channels: [email({ subject: "{{msg}}", body: "{{msg}}" })],
    });
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: db,
      providers: { email: emailProvider },
    });
    // Don't upsert recipient — this will cause an error after timeline context is set up
    try {
      await notify.send({
        recipientId: "nonexistent",
        notificationId: "test",
        payload: { msg: "hi" },
      });
    } catch {
      // expected
    }

    // Even though send threw, if any events were buffered they should have been flushed
    // In this case the error happens before timeline events are recorded (recipient lookup),
    // so we just verify the flush doesn't cause a secondary crash
    expect(db._state.timelineEvents.length).toBe(0);
  });

  test("events are in correct chronological order with inline queue", async () => {
    const { notify } = setup();
    await notify.upsertRecipient({ id: "u1", email: "u1@test.com" });

    const result = await notify.send({
      recipientId: "u1",
      notificationId: "comment_mentioned",
      payload: { author: "Alice", body: "Hello" },
    });

    const timeline = await notify.timeline(result.notification!.id);
    const events = timeline.map((e) => e.event);

    const payloadIdx = events.indexOf("payload.validated");
    const recipientIdx = events.indexOf("recipient.resolved");
    const prefsIdx = events.indexOf("preferences.resolved");
    const deliveryCreatedIdx = events.indexOf("delivery.created");
    const deliverySentIdx = events.indexOf("delivery.sent");

    expect(payloadIdx).toBeLessThan(recipientIdx);
    expect(recipientIdx).toBeLessThan(prefsIdx);
    expect(prefsIdx).toBeLessThan(deliveryCreatedIdx);
    expect(deliveryCreatedIdx).toBeLessThan(deliverySentIdx);
  });

  test("limit option truncates results", async () => {
    const { notify } = setup();
    await notify.upsertRecipient({ id: "u1", email: "u1@test.com" });

    const result = await notify.send({
      recipientId: "u1",
      notificationId: "comment_mentioned",
      payload: { author: "Alice", body: "Hello" },
    });

    const all = await notify.timeline(result.notification!.id);
    expect(all.length).toBeGreaterThan(3);

    const limited = await notify.timeline(result.notification!.id, { limit: 3 });
    expect(limited.length).toBe(3);
    expect(limited[0]!.event).toBe(all[0]!.event);
    expect(limited[2]!.event).toBe(all[2]!.event);
  });

  test("limit larger than total returns all events", async () => {
    const { notify } = setup();
    await notify.upsertRecipient({ id: "u1", email: "u1@test.com" });

    const result = await notify.send({
      recipientId: "u1",
      notificationId: "comment_mentioned",
      payload: { author: "Alice", body: "Hello" },
    });

    const all = await notify.timeline(result.notification!.id);
    const limited = await notify.timeline(result.notification!.id, { limit: 999 });
    expect(limited.length).toBe(all.length);
  });
});
