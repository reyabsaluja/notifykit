import { describe, expect, test } from "bun:test";
import {
  channel,
  createNotifyKit,
  fakeSmsProvider,
  fakeWebhookProvider,
  memoryAdapter,
  notification,
} from "../src/index.js";

const inbox = channel.inbox();
const email = channel.email();
const webhook = channel.webhook();
const sms = channel.sms();

const alwaysFail = {
  id: "always-fail",
  async send() {
    throw new Error("simulated provider failure");
  },
};

const alwaysFailWebhook = {
  id: "always-fail-webhook",
  async send() {
    throw new Error("simulated webhook failure");
  },
};

describe("fallback channel", () => {
  test("fires an inbox item when primary delivery fails after retries", async () => {
    const def = notification({
      id: "password_reset",
      payload: { link: "string" },
      channels: [
        email({ subject: "Reset", body: "Click {{link}}" }),
      ],
      fallback: inbox({
        title: "Password reset (fallback)",
        body: "We tried to email you but it failed. Open {{link}} to reset.",
        actionUrl: "{{link}}",
      }),
    });

    const db = memoryAdapter();
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: db,
      providers: { email: alwaysFail },
      retry: { maxAttempts: 2, delayMs: () => 0 },
    });

    await notify.upsertRecipient({ id: "u1", email: "u@x.com" });

    const result = await notify.send({
      recipientId: "u1",
      notificationId: "password_reset",
      payload: { link: "/reset/abc" },
    });

    // Primary delivery fails …
    expect(result.deliveries[0]!.status).toBe("failed");

    // … but a fallback inbox item appears for the user.
    const items = await notify.inbox.list("u1");
    expect(items).toHaveLength(1);
    expect(items[0]!.title).toBe("Password reset (fallback)");
    expect(items[0]!.body).toMatch(/\/reset\/abc/);
    expect(items[0]!.actionUrl).toBe("/reset/abc");
  });

  test("does not fire if primary delivery eventually succeeds", async () => {
    let attempts = 0;
    const flaky = {
      id: "flaky",
      async send() {
        attempts++;
        if (attempts < 2) throw new Error("transient");
        return { providerMessageId: "ok" };
      },
    };
    const def = notification({
      id: "reset",
      payload: { link: "string" },
      channels: [email({ subject: "Reset", body: "{{link}}" })],
      fallback: inbox({ title: "Fallback for {{link}}" }),
    });

    const db = memoryAdapter();
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: db,
      providers: { email: flaky },
      retry: { maxAttempts: 3, delayMs: () => 0 },
    });
    await notify.upsertRecipient({ id: "u1", email: "u@x.com" });
    await notify.send({
      recipientId: "u1",
      notificationId: "reset",
      payload: { link: "/r/1" },
    });

    const items = await notify.inbox.list("u1");
    expect(items).toEqual([]);
  });

  test("respects inbox preference — skipped if user opted out of inbox", async () => {
    const def = notification({
      id: "reset",
      payload: { link: "string" },
      channels: [email({ subject: "Reset", body: "{{link}}" })],
      fallback: inbox({ title: "Fallback" }),
    });
    const db = memoryAdapter();
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: db,
      providers: { email: alwaysFail },
      retry: { maxAttempts: 1, delayMs: () => 0 },
    });
    await notify.upsertRecipient({ id: "u1", email: "u@x.com" });
    await notify.preferences.update({
      recipientId: "u1",
      notificationId: "reset",
      channels: { inbox: false },
    });
    await notify.send({
      recipientId: "u1",
      notificationId: "reset",
      payload: { link: "/r/1" },
    });
    const items = await notify.inbox.list("u1");
    expect(items).toEqual([]);
  });

  test("respects global inbox preference — skipped if user globally opted out", async () => {
    const def = notification({
      id: "reset",
      payload: { link: "string" },
      channels: [email({ subject: "Reset", body: "{{link}}" })],
      fallback: inbox({ title: "Fallback" }),
    });
    const db = memoryAdapter();
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: db,
      providers: { email: alwaysFail },
      retry: { maxAttempts: 1, delayMs: () => 0 },
    });
    await notify.upsertRecipient({ id: "u1", email: "u@x.com" });
    await notify.preferences.updateGlobal({
      recipientId: "u1",
      channels: { inbox: false },
    });
    await notify.send({
      recipientId: "u1",
      notificationId: "reset",
      payload: { link: "/r/1" },
    });
    const items = await notify.inbox.list("u1");
    expect(items).toEqual([]);
  });

  test("respects app-level defaults — skipped if app disables inbox", async () => {
    const def = notification({
      id: "reset",
      payload: { link: "string" },
      channels: [email({ subject: "Reset", body: "{{link}}" })],
      fallback: inbox({ title: "Fallback" }),
    });
    const db = memoryAdapter();
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: db,
      providers: { email: alwaysFail },
      retry: { maxAttempts: 1, delayMs: () => 0 },
      defaults: { channels: { inbox: false } },
    });
    await notify.upsertRecipient({ id: "u1", email: "u@x.com" });
    await notify.send({
      recipientId: "u1",
      notificationId: "reset",
      payload: { link: "/r/1" },
    });
    const items = await notify.inbox.list("u1");
    expect(items).toEqual([]);
  });

  test("required notification still gets fallback even when user opted out", async () => {
    const def = notification({
      id: "reset",
      payload: { link: "string" },
      channels: [email({ subject: "Reset", body: "{{link}}" })],
      fallback: inbox({ title: "Fallback" }),
      required: true,
    });
    const db = memoryAdapter();
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: db,
      providers: { email: alwaysFail },
      retry: { maxAttempts: 1, delayMs: () => 0 },
    });
    await notify.upsertRecipient({ id: "u1", email: "u@x.com" });
    await notify.preferences.update({
      recipientId: "u1",
      notificationId: "reset",
      channels: { inbox: false },
    });
    await notify.send({
      recipientId: "u1",
      notificationId: "reset",
      payload: { link: "/r/1" },
    });
    const items = await notify.inbox.list("u1");
    expect(items).toHaveLength(1);
  });

  test("rejects duplicate channel types at definition time", () => {
    const def = notification({
      id: "double",
      payload: { msg: "string" },
      channels: [
        email({ subject: "A", body: "{{msg}}" }),
        email({ subject: "B", body: "{{msg}}" }),
      ],
      fallback: inbox({ title: "Fallback: {{msg}}" }),
    });
    expect(() =>
      createNotifyKit({
        notifications: [def] as const,
        database: memoryAdapter(),
        providers: { email: alwaysFail },
        retry: { maxAttempts: 1, delayMs: () => 0 },
      }),
    ).toThrow(/duplicate.*email/i);
  });
});

describe("rule-based fallback", () => {
  test("email fails → webhook sent via channel.failed rule", async () => {
    const whProvider = fakeWebhookProvider();
    const def = notification({
      id: "alert",
      payload: { msg: "string" },
      channels: [
        email({ subject: "Alert", body: "{{msg}}" }),
      ],
      fallback: [
        { if: "channel.failed", then: webhook({ url: "https://93.184.216.34/fallback", headers: {} }), from: "email" },
      ],
    });
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: memoryAdapter(),
      providers: { email: alwaysFail, webhook: whProvider },
      retry: { maxAttempts: 1, delayMs: () => 0 },
    });
    await notify.upsertRecipient({ id: "u1", email: "u@x.com" });

    const result = await notify.send({
      recipientId: "u1",
      notificationId: "alert",
      payload: { msg: "server down" },
    });

    expect(result.deliveries[0]!.status).toBe("failed");
    expect(whProvider.sent).toHaveLength(1);
    expect(whProvider.sent[0]!.payload.payload.msg).toBe("server down");
  });

  test("email fails → inbox created via channel.failed rule", async () => {
    const def = notification({
      id: "alert",
      payload: { msg: "string" },
      channels: [
        email({ subject: "Alert", body: "{{msg}}" }),
      ],
      fallback: [
        { if: "channel.failed", then: inbox({ title: "Fallback: {{msg}}" }), from: "email" },
      ],
    });
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: memoryAdapter(),
      providers: { email: alwaysFail },
      retry: { maxAttempts: 1, delayMs: () => 0 },
    });
    await notify.upsertRecipient({ id: "u1", email: "u@x.com" });

    await notify.send({
      recipientId: "u1",
      notificationId: "alert",
      payload: { msg: "important" },
    });

    const items = await notify.inbox.list("u1");
    expect(items).toHaveLength(1);
    expect(items[0]!.title).toBe("Fallback: important");
  });

  test("missing_address triggers fallback when recipient has no email", async () => {
    const def = notification({
      id: "welcome",
      payload: { name: "string" },
      channels: [
        email({ subject: "Hi {{name}}", body: "Welcome {{name}}" }),
      ],
      fallback: [
        { if: "missing_address", then: inbox({ title: "Welcome {{name}}" }), from: "email" },
      ],
    });
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: memoryAdapter(),
      providers: { email: alwaysFail },
      retry: { maxAttempts: 1, delayMs: () => 0 },
    });
    await notify.upsertRecipient({ id: "u1" });

    await notify.send({
      recipientId: "u1",
      notificationId: "welcome",
      payload: { name: "Alice" },
    });

    const items = await notify.inbox.list("u1");
    expect(items).toHaveLength(1);
    expect(items[0]!.title).toBe("Welcome Alice");
  });

  test("skipped (preference-disabled) triggers fallback", async () => {
    const whProvider = fakeWebhookProvider();
    const def = notification({
      id: "update",
      payload: { msg: "string" },
      channels: [
        email({ subject: "Update", body: "{{msg}}" }),
      ],
      fallback: [
        { if: "skipped", then: webhook({ url: "https://93.184.216.34/notify", headers: {} }), from: "email" },
      ],
    });
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: memoryAdapter(),
      providers: { email: alwaysFail, webhook: whProvider },
      retry: { maxAttempts: 1, delayMs: () => 0 },
    });
    await notify.upsertRecipient({ id: "u1", email: "u@x.com" });
    await notify.preferences.update({
      recipientId: "u1",
      notificationId: "update",
      channels: { email: false },
    });

    const result = await notify.send({
      recipientId: "u1",
      notificationId: "update",
      payload: { msg: "hello" },
    });

    expect(result.skippedChannels).toContain("email");
    expect(whProvider.sent).toHaveLength(1);
  });

  test("from filter limits which channel triggers the rule", async () => {
    const whProvider = fakeWebhookProvider();
    const def = notification({
      id: "alert",
      payload: { msg: "string" },
      channels: [
        webhook({ url: "https://93.184.216.34/primary", headers: {} }),
      ],
      fallback: [
        { if: "channel.failed", then: inbox({ title: "Fallback: {{msg}}" }), from: "email" },
      ],
    });
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: memoryAdapter(),
      providers: { webhook: alwaysFailWebhook },
      retry: { maxAttempts: 1, delayMs: () => 0 },
    });
    await notify.upsertRecipient({ id: "u1" });

    await notify.send({
      recipientId: "u1",
      notificationId: "alert",
      payload: { msg: "test" },
    });

    const items = await notify.inbox.list("u1");
    expect(items).toHaveLength(0);
  });

  test("first matching rule wins (ordered priority)", async () => {
    const whProvider = fakeWebhookProvider();
    const def = notification({
      id: "alert",
      payload: { msg: "string" },
      channels: [
        email({ subject: "Alert", body: "{{msg}}" }),
      ],
      fallback: [
        { if: "channel.failed", then: inbox({ title: "First: {{msg}}" }) },
        { if: "channel.failed", then: webhook({ url: "https://93.184.216.34/second", headers: {} }) },
      ],
    });
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: memoryAdapter(),
      providers: { email: alwaysFail, webhook: whProvider },
      retry: { maxAttempts: 1, delayMs: () => 0 },
    });
    await notify.upsertRecipient({ id: "u1", email: "u@x.com" });

    await notify.send({
      recipientId: "u1",
      notificationId: "alert",
      payload: { msg: "urgent" },
    });

    const items = await notify.inbox.list("u1");
    expect(items).toHaveLength(1);
    expect(items[0]!.title).toBe("First: urgent");
    expect(whProvider.sent).toHaveLength(0);
  });

  test("does not fallback to the same channel type that failed", async () => {
    const def = notification({
      id: "alert",
      payload: { msg: "string" },
      channels: [
        email({ subject: "Alert", body: "{{msg}}" }),
      ],
      fallback: [
        { if: "channel.failed", then: email({ subject: "Retry", body: "{{msg}}" }) },
      ],
    });
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: memoryAdapter(),
      providers: { email: alwaysFail },
      retry: { maxAttempts: 1, delayMs: () => 0 },
    });
    await notify.upsertRecipient({ id: "u1", email: "u@x.com" });

    const result = await notify.send({
      recipientId: "u1",
      notificationId: "alert",
      payload: { msg: "test" },
    });

    expect(result.deliveries).toHaveLength(1);
    const items = await notify.inbox.list("u1");
    expect(items).toHaveLength(0);
  });

  test("fallback respects preferences on the target channel", async () => {
    const def = notification({
      id: "alert",
      payload: { msg: "string" },
      channels: [
        email({ subject: "Alert", body: "{{msg}}" }),
      ],
      fallback: [
        { if: "channel.failed", then: inbox({ title: "Fallback: {{msg}}" }) },
      ],
    });
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: memoryAdapter(),
      providers: { email: alwaysFail },
      retry: { maxAttempts: 1, delayMs: () => 0 },
    });
    await notify.upsertRecipient({ id: "u1", email: "u@x.com" });
    await notify.preferences.update({
      recipientId: "u1",
      notificationId: "alert",
      channels: { inbox: false },
    });

    await notify.send({
      recipientId: "u1",
      notificationId: "alert",
      payload: { msg: "test" },
    });

    const items = await notify.inbox.list("u1");
    expect(items).toHaveLength(0);
  });

  test("legacy InboxChannelConfig fallback still works alongside rule-based", async () => {
    const def = notification({
      id: "legacy",
      payload: { msg: "string" },
      channels: [email({ subject: "S", body: "{{msg}}" })],
      fallback: inbox({ title: "Legacy fallback: {{msg}}" }),
    });
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: memoryAdapter(),
      providers: { email: alwaysFail },
      retry: { maxAttempts: 1, delayMs: () => 0 },
    });
    await notify.upsertRecipient({ id: "u1", email: "u@x.com" });

    await notify.send({
      recipientId: "u1",
      notificationId: "legacy",
      payload: { msg: "hello" },
    });

    const items = await notify.inbox.list("u1");
    expect(items).toHaveLength(1);
    expect(items[0]!.title).toBe("Legacy fallback: hello");
  });

  test("webhook fails → inbox fallback without from filter", async () => {
    const def = notification({
      id: "hook",
      payload: { msg: "string" },
      channels: [
        webhook({ url: "https://93.184.216.34/primary", headers: {} }),
      ],
      fallback: [
        { if: "channel.failed", then: inbox({ title: "Hook failed: {{msg}}" }) },
      ],
    });
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: memoryAdapter(),
      providers: { webhook: alwaysFailWebhook },
      retry: { maxAttempts: 1, delayMs: () => 0 },
    });
    await notify.upsertRecipient({ id: "u1" });

    await notify.send({
      recipientId: "u1",
      notificationId: "hook",
      payload: { msg: "down" },
    });

    const items = await notify.inbox.list("u1");
    expect(items).toHaveLength(1);
    expect(items[0]!.title).toBe("Hook failed: down");
  });

  test("unmatched fallback rule still creates notification record with skipped deliveries", async () => {
    const def = notification({
      id: "alert",
      payload: { msg: "string" },
      channels: [
        email({ subject: "Alert", body: "{{msg}}" }),
      ],
      fallback: [
        { if: "missing_address", then: inbox({ title: "No email: {{msg}}" }), from: "email" },
      ],
    });
    const db = memoryAdapter();
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: db,
      providers: { email: alwaysFail },
      retry: { maxAttempts: 1, delayMs: () => 0 },
    });
    await notify.upsertRecipient({ id: "u1", email: "u@x.com" });
    await notify.preferences.update({
      recipientId: "u1",
      notificationId: "alert",
      channels: { email: false },
    });

    const result = await notify.send({
      recipientId: "u1",
      notificationId: "alert",
      payload: { msg: "test" },
    });

    expect(result.notification).not.toBeNull();
    expect(result.deliveries).toHaveLength(1);
    expect(result.deliveries[0]!.status).toBe("skipped");
    expect(result.inboxItems).toHaveLength(0);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]!.reason).toBe("preferences_disabled");
  });
});

describe("sms channel and sms fallback", () => {
  test("email fails → sms sent via channel.failed rule", async () => {
    const smsProvider = fakeSmsProvider();
    const def = notification({
      id: "alert",
      payload: { msg: "string" },
      channels: [
        email({ subject: "Alert", body: "{{msg}}" }),
      ],
      fallback: [
        { if: "channel.failed", then: sms({ body: "Fallback: {{msg}}" }), from: "email" },
      ],
    });
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: memoryAdapter(),
      providers: { email: alwaysFail, sms: smsProvider },
      retry: { maxAttempts: 1, delayMs: () => 0 },
    });
    await notify.upsertRecipient({ id: "u1", email: "u@x.com", phone: "+15551234567" });

    const result = await notify.send({
      recipientId: "u1",
      notificationId: "alert",
      payload: { msg: "server down" },
    });

    expect(result.deliveries[0]!.status).toBe("failed");
    expect(smsProvider.sent).toHaveLength(1);
    expect(smsProvider.sent[0]!.body).toBe("Fallback: server down");
    expect(smsProvider.sent[0]!.to).toBe("+15551234567");
  });

  test("sms as primary channel delivers", async () => {
    const smsProvider = fakeSmsProvider();
    const def = notification({
      id: "otp",
      payload: { code: "string" },
      channels: [
        sms({ body: "Your code: {{code}}" }),
      ],
    });
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: memoryAdapter(),
      providers: { sms: smsProvider },
      retry: { maxAttempts: 1, delayMs: () => 0 },
    });
    await notify.upsertRecipient({ id: "u1", phone: "+15551234567" });

    const result = await notify.send({
      recipientId: "u1",
      notificationId: "otp",
      payload: { code: "1234" },
    });

    expect(result.deliveries).toHaveLength(1);
    expect(result.deliveries[0]!.status).toBe("sent");
    expect(smsProvider.sent).toHaveLength(1);
    expect(smsProvider.sent[0]!.body).toBe("Your code: 1234");
  });

  test("sms skipped when recipient has no phone", async () => {
    const smsProvider = fakeSmsProvider();
    const def = notification({
      id: "otp",
      payload: { code: "string" },
      channels: [
        sms({ body: "Your code: {{code}}" }),
      ],
    });
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: memoryAdapter(),
      providers: { sms: smsProvider },
      retry: { maxAttempts: 1, delayMs: () => 0 },
    });
    await notify.upsertRecipient({ id: "u1" });

    const result = await notify.send({
      recipientId: "u1",
      notificationId: "otp",
      payload: { code: "1234" },
    });

    expect(result.skippedChannels).toContain("sms");
    expect(smsProvider.sent).toHaveLength(0);
  });

  test("missing_address on sms triggers fallback to inbox", async () => {
    const smsProvider = fakeSmsProvider();
    const def = notification({
      id: "otp",
      payload: { code: "string" },
      channels: [
        sms({ body: "Your code: {{code}}" }),
      ],
      fallback: [
        { if: "missing_address", then: inbox({ title: "OTP: {{code}}" }), from: "sms" },
      ],
    });
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: memoryAdapter(),
      providers: { sms: smsProvider },
      retry: { maxAttempts: 1, delayMs: () => 0 },
    });
    await notify.upsertRecipient({ id: "u1" });

    await notify.send({
      recipientId: "u1",
      notificationId: "otp",
      payload: { code: "5678" },
    });

    const items = await notify.inbox.list("u1");
    expect(items).toHaveLength(1);
    expect(items[0]!.title).toBe("OTP: 5678");
  });

  test("sms provider required at startup when used in fallback", () => {
    const def = notification({
      id: "alert",
      payload: { msg: "string" },
      channels: [
        email({ subject: "Alert", body: "{{msg}}" }),
      ],
      fallback: [
        { if: "channel.failed", then: sms({ body: "Fallback: {{msg}}" }) },
      ],
    });
    expect(() =>
      createNotifyKit({
        notifications: [def] as const,
        database: memoryAdapter(),
        providers: { email: alwaysFail },
        retry: { maxAttempts: 1, delayMs: () => 0 },
      }),
    ).toThrow(/sms.*provider/i);
  });

  test("email provider required at startup when used in fallback", () => {
    const smsProvider = fakeSmsProvider();
    const def = notification({
      id: "alert",
      payload: { msg: "string" },
      channels: [
        sms({ body: "{{msg}}" }),
      ],
      fallback: [
        { if: "channel.failed", then: email({ subject: "Fallback", body: "{{msg}}" }) },
      ],
    });
    expect(() =>
      createNotifyKit({
        notifications: [def] as const,
        database: memoryAdapter(),
        providers: { sms: smsProvider },
        retry: { maxAttempts: 1, delayMs: () => 0 },
      }),
    ).toThrow(/email.*provider/i);
  });

  test("fallback does not duplicate a primary channel already delivered", async () => {
    const smsProvider = fakeSmsProvider();
    const def = notification({
      id: "alert",
      payload: { msg: "string" },
      channels: [
        email({ subject: "Alert", body: "{{msg}}" }),
        sms({ body: "{{msg}}" }),
      ],
      fallback: [
        { if: "channel.failed", then: sms({ body: "Fallback: {{msg}}" }) },
      ],
    });
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: memoryAdapter(),
      providers: { email: alwaysFail, sms: smsProvider },
      retry: { maxAttempts: 1, delayMs: () => 0 },
    });
    await notify.upsertRecipient({ id: "u1", email: "u@x.com", phone: "+15551234567" });

    await notify.send({
      recipientId: "u1",
      notificationId: "alert",
      payload: { msg: "test" },
    });

    expect(smsProvider.sent).toHaveLength(1);
  });

  test("inbox-only notification never triggers channel.failed fallback (inbox is local)", async () => {
    const smsProvider = fakeSmsProvider();
    const def = notification({
      id: "local-only",
      payload: { msg: "string" },
      channels: [
        inbox({ title: "{{msg}}" }),
      ],
      fallback: [
        { if: "channel.failed", then: sms({ body: "Fallback: {{msg}}" }) },
      ],
    });
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: memoryAdapter(),
      providers: { sms: smsProvider },
      retry: { maxAttempts: 1, delayMs: () => 0 },
    });
    await notify.upsertRecipient({ id: "u1", phone: "+15551234567" });

    const result = await notify.send({
      recipientId: "u1",
      notificationId: "local-only",
      payload: { msg: "hello" },
    });

    expect(result.inboxItems).toHaveLength(1);
    expect(smsProvider.sent).toHaveLength(0);
  });

  test("all-disabled with channel.failed-only fallback still short-circuits", async () => {
    const smsProvider = fakeSmsProvider();
    const def = notification({
      id: "alert",
      payload: { msg: "string" },
      channels: [
        email({ subject: "Alert", body: "{{msg}}" }),
      ],
      fallback: [
        { if: "channel.failed", then: sms({ body: "Fallback: {{msg}}" }) },
      ],
    });
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: memoryAdapter(),
      providers: { email: alwaysFail, sms: smsProvider },
      retry: { maxAttempts: 1, delayMs: () => 0 },
    });
    await notify.upsertRecipient({ id: "u1", email: "u@x.com", phone: "+15551234567" });
    await notify.preferences.update({
      recipientId: "u1",
      notificationId: "alert",
      channels: { email: false },
    });

    const result = await notify.send({
      recipientId: "u1",
      notificationId: "alert",
      payload: { msg: "test" },
    });

    expect(result.notification).not.toBeNull();
    expect(result.deliveries).toHaveLength(1);
    expect(result.deliveries[0]!.status).toBe("skipped");
    expect(result.skipped).toHaveLength(1);
    expect(smsProvider.sent).toHaveLength(0);
  });

  test("fallback delivery failure does not trigger further fallbacks (single-hop)", async () => {
    const alwaysFailSms = {
      id: "always-fail-sms",
      async send() {
        throw new Error("simulated sms failure");
      },
    };
    const def = notification({
      id: "chain-test",
      payload: { msg: "string" },
      channels: [email({ subject: "{{msg}}", body: "{{msg}}" })],
      fallback: [
        { if: "channel.failed", from: "email", then: sms({ body: "{{msg}}" }) },
        { if: "channel.failed", from: "sms", then: webhook({ url: "https://hook.test/x" }) },
      ],
    });
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: memoryAdapter(),
      providers: { email: alwaysFail, sms: alwaysFailSms, webhook: fakeWebhookProvider() },
      retry: { maxAttempts: 1 },
    });
    await notify.upsertRecipient({ id: "u1", email: "u@t.co", phone: "+1" });
    await notify.send({ recipientId: "u1", notificationId: "chain-test", payload: { msg: "hi" } });

    const deliveries = await notify.deliveries.list("u1");
    const channels = deliveries.map((d) => d.channel);
    expect(channels).toContain("email");
    expect(channels).toContain("sms");
    expect(channels).not.toContain("webhook");
  });
});
