import { describe, expect, test, mock } from "bun:test";
import {
  channel,
  createNotifyKit,
  memoryAdapter,
  notification,
} from "../src/index.js";

const inbox = channel.inbox();
const email = channel.email();
const sms = channel.sms();
const webhook = channel.webhook();

const alertNotification = notification({
  id: "alert",
  payload: { message: "string" },
  channels: [inbox({ title: "Alert: {{message}}" })],
});

const welcomeNotification = notification({
  id: "welcome",
  payload: { name: "string" },
  channels: [
    inbox({ title: "Welcome {{name}}" }),
    email({ subject: "Welcome {{name}}", body: "Hello {{name}}!" }),
  ],
});

const smsNotification = notification({
  id: "verify_phone",
  payload: { code: "string" },
  channels: [sms({ body: "Your code is {{code}}" })],
});

const webhookNotification = notification({
  id: "webhook_event",
  payload: { event: "string" },
  channels: [webhook({ url: "https://example.com/hook", headers: {} })],
});

describe("dev mode", () => {
  test("blocks sends when no allowlist", async () => {
    const db = memoryAdapter();
    const notify = createNotifyKit({
      notifications: [welcomeNotification] as const,
      database: db,
      mode: "development",
    });

    expect(notify.isDev).toBe(true);

    await notify.upsertRecipient({ id: "u1", email: "real@production.com" });
    const result = await notify.send({
      recipientId: "u1",
      notificationId: "welcome",
      payload: { name: "Test" },
    });

    expect(result.deliveries).toHaveLength(1);
    expect(result.deliveries[0]!.status).toBe("sent");

    expect(notify.captured).toHaveLength(1);
    expect(notify.captured[0]!.blocked).toBe(true);
    expect(notify.captured[0]!.channel).toBe("email");
    expect(notify.captured[0]!.to).toBe("real@production.com");
  });

  test("allows sends to allowlisted addresses", async () => {
    const db = memoryAdapter();
    const notify = createNotifyKit({
      notifications: [welcomeNotification] as const,
      database: db,
      mode: "development",
      dev: { allowlist: ["allowed@dev.com"] },
    });

    await notify.upsertRecipient({ id: "u1", email: "allowed@dev.com" });
    const result = await notify.send({
      recipientId: "u1",
      notificationId: "welcome",
      payload: { name: "Dev" },
    });

    expect(notify.captured).toHaveLength(1);
    expect(notify.captured[0]!.blocked).toBe(false);
  });

  test("allowlist is case-insensitive", async () => {
    const db = memoryAdapter();
    const notify = createNotifyKit({
      notifications: [welcomeNotification] as const,
      database: db,
      mode: "development",
      dev: { allowlist: ["Allowed@Dev.COM"] },
    });

    await notify.upsertRecipient({ id: "u1", email: "allowed@dev.com" });
    await notify.send({
      recipientId: "u1",
      notificationId: "welcome",
      payload: { name: "Test" },
    });

    expect(notify.captured[0]!.blocked).toBe(false);
  });

  test("adds subject prefix to emails", async () => {
    const db = memoryAdapter();
    const notify = createNotifyKit({
      notifications: [welcomeNotification] as const,
      database: db,
      mode: "development",
      dev: { allowlist: ["dev@test.com"] },
    });

    await notify.upsertRecipient({ id: "u1", email: "dev@test.com" });
    await notify.send({
      recipientId: "u1",
      notificationId: "welcome",
      payload: { name: "Alice" },
    });

    expect(notify.captured[0]!.subject).toBe("[DEV] Welcome Alice");
  });

  test("custom subject prefix", async () => {
    const db = memoryAdapter();
    const notify = createNotifyKit({
      notifications: [welcomeNotification] as const,
      database: db,
      mode: "development",
      dev: { allowlist: ["dev@test.com"], subjectPrefix: "[STAGING] " },
    });

    await notify.upsertRecipient({ id: "u1", email: "dev@test.com" });
    await notify.send({
      recipientId: "u1",
      notificationId: "welcome",
      payload: { name: "Bob" },
    });

    expect(notify.captured[0]!.subject).toBe("[STAGING] Welcome Bob");
  });

  test("production mode has isDev=false and empty captured", async () => {
    const db = memoryAdapter();
    const notify = createNotifyKit({
      notifications: [alertNotification] as const,
      database: db,
      mode: "production",
    });

    expect(notify.isDev).toBe(false);
    expect(notify.captured).toHaveLength(0);
  });

  test("default mode (omitted) has isDev=false", () => {
    const db = memoryAdapter();
    const notify = createNotifyKit({
      notifications: [alertNotification] as const,
      database: db,
    });

    expect(notify.isDev).toBe(false);
  });

  test("SMS channel is blocked in dev mode", async () => {
    const db = memoryAdapter();
    const notify = createNotifyKit({
      notifications: [smsNotification] as const,
      database: db,
      mode: "development",
      providers: { sms: { id: "real-sms", async send() { return {}; } } },
    });

    await notify.upsertRecipient({ id: "u1", phone: "+15551234567" });
    await notify.send({
      recipientId: "u1",
      notificationId: "verify_phone",
      payload: { code: "1234" },
    });

    expect(notify.captured).toHaveLength(1);
    expect(notify.captured[0]!.channel).toBe("sms");
    expect(notify.captured[0]!.blocked).toBe(true);
    expect(notify.captured[0]!.to).toBe("+15551234567");
  });

  test("webhook channel is blocked in dev mode", async () => {
    const db = memoryAdapter();
    const notify = createNotifyKit({
      notifications: [webhookNotification] as const,
      database: db,
      mode: "development",
      providers: { webhook: { id: "real-webhook", signed: false, async send() { return {}; } } },
    });

    await notify.upsertRecipient({ id: "u1" });
    await notify.send({
      recipientId: "u1",
      notificationId: "webhook_event",
      payload: { event: "test" },
    });

    expect(notify.captured).toHaveLength(1);
    expect(notify.captured[0]!.channel).toBe("webhook");
    expect(notify.captured[0]!.blocked).toBe(true);
    expect(notify.captured[0]!.to).toBe("https://example.com/hook");
  });

  test("inbox channel still works normally in dev mode", async () => {
    const db = memoryAdapter();
    const notify = createNotifyKit({
      notifications: [welcomeNotification] as const,
      database: db,
      mode: "development",
    });

    await notify.upsertRecipient({ id: "u1", email: "user@example.com" });
    await notify.send({
      recipientId: "u1",
      notificationId: "welcome",
      payload: { name: "Test" },
    });

    const items = await notify.inbox.list("u1");
    expect(items).toHaveLength(1);
    expect(items[0]!.title).toBe("Welcome Test");
  });

  test("captured array respects maxCaptured limit", async () => {
    const db = memoryAdapter();
    const notify = createNotifyKit({
      notifications: [alertNotification, welcomeNotification] as const,
      database: db,
      mode: "development",
      dev: { maxCaptured: 3 },
    });

    await notify.upsertRecipient({ id: "u1", email: "a@test.com" });
    for (let i = 0; i < 5; i++) {
      await notify.send({
        recipientId: "u1",
        notificationId: "welcome",
        payload: { name: `User${i}` },
      });
    }

    expect(notify.captured).toHaveLength(3);
    expect(notify.captured[0]!.subject).toContain("User2");
    expect(notify.captured[2]!.subject).toContain("User4");
  });
});
