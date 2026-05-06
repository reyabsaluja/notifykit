import { describe, expect, test } from "bun:test";
import {
  channel,
  createNotifyKit,
  fakeEmailProvider,
  fakeSmsProvider,
  memoryAdapter,
  notification,
} from "../src/index.js";

describe("skip reasons", () => {
  test("returns structured skipped[] when preferences disable a channel", async () => {
    const inbox = channel.inbox();
    const email = channel.email();
    const def = notification({
      id: "comment",
      payload: { msg: "string" },
      channels: [
        inbox({ title: "{{msg}}" }),
        email({ subject: "hi", body: "{{msg}}" }),
      ],
    });
    const db = memoryAdapter();
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: db,
      providers: { email: fakeEmailProvider() },
    });

    await notify.upsertRecipient({ id: "u1", email: "u@x.com" });
    await notify.preferences.update({
      recipientId: "u1",
      notificationId: "comment",
      channels: { email: false },
    });

    const result = await notify.send({
      recipientId: "u1",
      notificationId: "comment",
      payload: { msg: "hello" },
    });

    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]!.channel).toBe("email");
    expect(result.skipped[0]!.reason).toBe("preferences_disabled");
    expect(result.skipped[0]!.details).toBeDefined();
    expect(result.skippedChannels).toEqual(["email"]);
  });

  test("returns missing_address skip reason when recipient has no email", async () => {
    const email = channel.email();
    const def = notification({
      id: "alert",
      payload: { msg: "string" },
      channels: [email({ subject: "hi", body: "{{msg}}" })],
    });
    const db = memoryAdapter();
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: db,
      providers: { email: fakeEmailProvider() },
    });

    await notify.upsertRecipient({ id: "u1" });

    const result = await notify.send({
      recipientId: "u1",
      notificationId: "alert",
      payload: { msg: "hello" },
    });

    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]!.channel).toBe("email");
    expect(result.skipped[0]!.reason).toBe("missing_address");
  });

  test("returns missing_address skip reason for SMS when recipient has no phone", async () => {
    const sms = channel.sms();
    const def = notification({
      id: "otp",
      payload: { code: "string" },
      channels: [sms({ body: "Code: {{code}}" })],
    });
    const db = memoryAdapter();
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: db,
      providers: { sms: fakeSmsProvider() },
    });

    await notify.upsertRecipient({ id: "u1" });

    const result = await notify.send({
      recipientId: "u1",
      notificationId: "otp",
      payload: { code: "1234" },
    });

    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]!.channel).toBe("sms");
    expect(result.skipped[0]!.reason).toBe("missing_address");
  });

  test("returns rate_limited skip reason on all channels when rate limited", async () => {
    const inbox = channel.inbox();
    const email = channel.email();
    const def = notification({
      id: "comment",
      payload: { msg: "string" },
      channels: [
        inbox({ title: "{{msg}}" }),
        email({ subject: "hi", body: "{{msg}}" }),
      ],
      rateLimit: { max: 1, windowMs: 60_000 },
    });
    const db = memoryAdapter();
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: db,
      providers: { email: fakeEmailProvider() },
    });

    await notify.upsertRecipient({ id: "u1", email: "u@x.com" });

    await notify.send({
      recipientId: "u1",
      notificationId: "comment",
      payload: { msg: "first" },
    });

    const result = await notify.send({
      recipientId: "u1",
      notificationId: "comment",
      payload: { msg: "second" },
    });

    expect(result.rateLimited).toBe(true);
    expect(result.skipped).toHaveLength(2);
    expect(result.skipped.every((s) => s.reason === "rate_limited")).toBe(true);
    expect(result.skipped.map((s) => s.channel).sort()).toEqual(["email", "inbox"]);
  });

  test("persists skipped deliveries visible in deliveries.list()", async () => {
    const email = channel.email();
    const inbox = channel.inbox();
    const def = notification({
      id: "update",
      payload: { msg: "string" },
      channels: [
        inbox({ title: "{{msg}}" }),
        email({ subject: "hi", body: "{{msg}}" }),
      ],
    });
    const db = memoryAdapter();
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: db,
      providers: { email: fakeEmailProvider() },
    });

    await notify.upsertRecipient({ id: "u1", email: "u@x.com" });
    await notify.preferences.update({
      recipientId: "u1",
      notificationId: "update",
      channels: { email: false },
    });

    await notify.send({
      recipientId: "u1",
      notificationId: "update",
      payload: { msg: "hi" },
    });

    const deliveries = await notify.deliveries.list("u1");
    const skippedDeliveries = deliveries.filter((d) => d.status === "skipped");
    expect(skippedDeliveries).toHaveLength(1);
    expect(skippedDeliveries[0]!.channel).toBe("email");
    expect(skippedDeliveries[0]!.skipReason).toBe("preferences_disabled");
    expect(skippedDeliveries[0]!.skipDetails).toBeDefined();
  });

  test("suppressed notification (all channels disabled) populates skipped[]", async () => {
    const email = channel.email();
    const def = notification({
      id: "promo",
      payload: { msg: "string" },
      channels: [email({ subject: "hi", body: "{{msg}}" })],
    });
    const db = memoryAdapter();
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: db,
      providers: { email: fakeEmailProvider() },
    });

    await notify.upsertRecipient({ id: "u1", email: "u@x.com" });
    await notify.preferences.update({
      recipientId: "u1",
      notificationId: "promo",
      channels: { email: false },
    });

    const result = await notify.send({
      recipientId: "u1",
      notificationId: "promo",
      payload: { msg: "sale" },
    });

    expect(result.notification).not.toBeNull();
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]!.channel).toBe("email");
    expect(result.skipped[0]!.reason).toBe("preferences_disabled");
  });

  test("digested sends return empty skipped[]", async () => {
    const inbox = channel.inbox();
    const def = notification({
      id: "activity",
      payload: { msg: "string" },
      channels: [inbox({ title: "{{msg}}" })],
      digest: {
        windowMs: 5000,
        render: ({ payloads }) => ({ msg: `${payloads.length} updates` }),
      },
    });
    const db = memoryAdapter();
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: db,
    });

    await notify.upsertRecipient({ id: "u1" });

    const result = await notify.send({
      recipientId: "u1",
      notificationId: "activity",
      payload: { msg: "hello" },
    });

    expect(result.digested).toBe(true);
    expect(result.skipped).toEqual([]);

    await notify.close();
  });

  test("returns quiet_hours_deferred skip reason for deferred channels", async () => {
    const email = channel.email();
    const inbox = channel.inbox();
    const def = notification({
      id: "update",
      payload: { msg: "string" },
      channels: [
        inbox({ title: "{{msg}}" }),
        email({ subject: "hi", body: "{{msg}}" }),
      ],
    });
    const db = memoryAdapter();
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: db,
      providers: { email: fakeEmailProvider() },
    });

    const now = new Date();
    const startHour = now.getHours() - 1;
    const endHour = now.getHours() + 1;
    const start = `${String((startHour + 24) % 24).padStart(2, "0")}:00`;
    const end = `${String(endHour % 24).padStart(2, "0")}:00`;

    await notify.upsertRecipient({
      id: "u1",
      email: "u@x.com",
      quietHours: { start, end, timezone: "UTC" },
    });

    const result = await notify.send({
      recipientId: "u1",
      notificationId: "update",
      payload: { msg: "hi" },
    });

    expect(result.deferredChannels).toContain("email");
    expect(result.skipped.some((s) => s.reason === "quiet_hours_deferred" && s.channel === "email")).toBe(true);

    await notify.close();
  });
});
