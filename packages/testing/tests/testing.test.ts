import { describe, expect, test } from "bun:test";
import { channel, notification } from "@notifykitjs/core";
import {
  createTestNotifyKit,
  assertSentEmail,
  assertNoEmailSent,
  assertInboxItem,
  assertNoInboxItems,
  assertDelivery,
  assertNotificationSent,
  assertNotificationNotSent,
} from "../src/index.js";

const inbox = channel.inbox();
const email = channel.email();

const welcomeNotification = notification({
  id: "welcome",
  payload: { name: "string" },
  channels: [
    inbox({ title: "Welcome, {{name}}!", body: "Thanks for signing up." }),
    email({ subject: "Welcome {{name}}", body: "Hello {{name}}, welcome!" }),
  ],
});

const alertNotification = notification({
  id: "alert",
  payload: { message: "string" },
  channels: [inbox({ title: "Alert: {{message}}" })],
});

describe("createTestNotifyKit", () => {
  test("creates a working instance with defaults", async () => {
    const notify = createTestNotifyKit([welcomeNotification] as const);
    await notify.upsertRecipient({ id: "u1", email: "u@test.com" });
    const result = await notify.send({
      recipientId: "u1",
      notificationId: "welcome",
      payload: { name: "Alice" },
    });
    expect(result.deliveries.length).toBeGreaterThan(0);
    expect(notify.testing.lastResult).toBe(result);
    expect(notify.testing.results).toHaveLength(1);
  });

  test("tracks sent emails via testing.sentEmails()", async () => {
    const notify = createTestNotifyKit([welcomeNotification] as const);
    await notify.upsertRecipient({ id: "u1", email: "u@test.com" });
    await notify.send({
      recipientId: "u1",
      notificationId: "welcome",
      payload: { name: "Bob" },
    });
    const emails = notify.testing.sentEmails();
    expect(emails).toHaveLength(1);
    expect(emails[0]!.to).toBe("u@test.com");
    expect(emails[0]!.subject).toBe("Welcome Bob");
  });

  test("inboxFor returns items for a recipient", async () => {
    const notify = createTestNotifyKit([welcomeNotification] as const);
    await notify.upsertRecipient({ id: "u1", email: "u@test.com" });
    await notify.send({
      recipientId: "u1",
      notificationId: "welcome",
      payload: { name: "Charlie" },
    });
    const items = await notify.testing.inboxFor("u1");
    expect(items).toHaveLength(1);
    expect(items[0]!.title).toBe("Welcome, Charlie!");
  });

  test("deliveriesFor returns records for a recipient", async () => {
    const notify = createTestNotifyKit([welcomeNotification] as const);
    await notify.upsertRecipient({ id: "u1", email: "u@test.com" });
    await notify.send({
      recipientId: "u1",
      notificationId: "welcome",
      payload: { name: "Dave" },
    });
    const deliveries = await notify.testing.deliveriesFor("u1");
    expect(deliveries.length).toBeGreaterThan(0);
    expect(deliveries.some((d) => d.channel === "email")).toBe(true);
  });

  test("reset() clears all state", async () => {
    const notify = createTestNotifyKit([welcomeNotification] as const);
    await notify.upsertRecipient({ id: "u1", email: "u@test.com" });
    await notify.send({
      recipientId: "u1",
      notificationId: "welcome",
      payload: { name: "Eve" },
    });
    expect(notify.testing.sentEmails()).toHaveLength(1);
    expect(notify.testing.results).toHaveLength(1);

    notify.testing.reset();

    expect(notify.testing.sentEmails()).toHaveLength(0);
    expect(notify.testing.results).toHaveLength(0);
    expect(notify.testing.lastResult).toBeNull();
    expect(notify.testing.database._state.inboxItems).toHaveLength(0);
    expect(notify.testing.database._state.deliveries).toHaveLength(0);
  });

  test("reset() preserves recipients for subsequent sends", async () => {
    const notify = createTestNotifyKit([welcomeNotification] as const);
    await notify.upsertRecipient({ id: "u1", email: "u@test.com" });
    await notify.send({
      recipientId: "u1",
      notificationId: "welcome",
      payload: { name: "First" },
    });

    notify.testing.reset();

    const result = await notify.send({
      recipientId: "u1",
      notificationId: "welcome",
      payload: { name: "Second" },
    });
    expect(result.deliveries).toHaveLength(1);
    expect(result.deliveries[0]!.status).toBe("sent");
  });

  test("dryRun sends are not tracked in results", async () => {
    const notify = createTestNotifyKit([welcomeNotification] as const);
    await notify.upsertRecipient({ id: "u1", email: "u@test.com" });
    await notify.send({
      recipientId: "u1",
      notificationId: "welcome",
      payload: { name: "Frank" },
      dryRun: true,
    });
    expect(notify.testing.results).toHaveLength(0);
    expect(notify.testing.lastResult).toBeNull();
  });

  test("accepts custom options", async () => {
    const notify = createTestNotifyKit([welcomeNotification] as const, {
      retry: { maxAttempts: 5 },
    });
    await notify.upsertRecipient({ id: "u1", email: "u@test.com" });
    const result = await notify.send({
      recipientId: "u1",
      notificationId: "welcome",
      payload: { name: "Grace" },
    });
    expect(result.deliveries.length).toBeGreaterThan(0);
  });
});

describe("assertion helpers", () => {
  test("assertSentEmail passes when email was sent", async () => {
    const notify = createTestNotifyKit([welcomeNotification] as const);
    await notify.upsertRecipient({ id: "u1", email: "u@test.com" });
    await notify.send({
      recipientId: "u1",
      notificationId: "welcome",
      payload: { name: "Test" },
    });
    assertSentEmail(notify);
    assertSentEmail(notify, { to: "u@test.com" });
    assertSentEmail(notify, { subject: "Welcome Test" });
    assertSentEmail(notify, { body: /Hello Test/ });
  });

  test("assertSentEmail throws when no email sent", () => {
    const notify = createTestNotifyKit([alertNotification] as const);
    expect(() => assertSentEmail(notify)).toThrow("Expected at least one email");
  });

  test("assertSentEmail throws when no match", async () => {
    const notify = createTestNotifyKit([welcomeNotification] as const);
    await notify.upsertRecipient({ id: "u1", email: "u@test.com" });
    await notify.send({
      recipientId: "u1",
      notificationId: "welcome",
      payload: { name: "Test" },
    });
    expect(() => assertSentEmail(notify, { to: "other@test.com" })).toThrow("No sent email matches");
  });

  test("assertNoEmailSent passes when no email sent", () => {
    const notify = createTestNotifyKit([alertNotification] as const);
    assertNoEmailSent(notify);
  });

  test("assertNoEmailSent throws when email was sent", async () => {
    const notify = createTestNotifyKit([welcomeNotification] as const);
    await notify.upsertRecipient({ id: "u1", email: "u@test.com" });
    await notify.send({
      recipientId: "u1",
      notificationId: "welcome",
      payload: { name: "Test" },
    });
    expect(() => assertNoEmailSent(notify)).toThrow("Expected no emails");
  });

  test("assertInboxItem passes when item exists", async () => {
    const notify = createTestNotifyKit([welcomeNotification] as const);
    await notify.upsertRecipient({ id: "u1", email: "u@test.com" });
    await notify.send({
      recipientId: "u1",
      notificationId: "welcome",
      payload: { name: "Test" },
    });
    assertInboxItem(notify);
    assertInboxItem(notify, { recipientId: "u1" });
    assertInboxItem(notify, { title: "Welcome, Test!" });
    assertInboxItem(notify, { title: /Welcome/ });
  });

  test("assertInboxItem throws when no items", () => {
    const notify = createTestNotifyKit([alertNotification] as const);
    expect(() => assertInboxItem(notify)).toThrow("Expected at least one inbox item");
  });

  test("assertNoInboxItems passes when empty", () => {
    const notify = createTestNotifyKit([alertNotification] as const);
    assertNoInboxItems(notify);
  });

  test("assertDelivery passes when delivery exists", async () => {
    const notify = createTestNotifyKit([welcomeNotification] as const);
    await notify.upsertRecipient({ id: "u1", email: "u@test.com" });
    await notify.send({
      recipientId: "u1",
      notificationId: "welcome",
      payload: { name: "Test" },
    });
    assertDelivery(notify);
    assertDelivery(notify, { channel: "email" });
    assertDelivery(notify, { status: "sent" });
  });

  test("assertNotificationSent / assertNotificationNotSent", async () => {
    const notify = createTestNotifyKit([welcomeNotification, alertNotification] as const);
    await notify.upsertRecipient({ id: "u1", email: "u@test.com" });
    await notify.send({
      recipientId: "u1",
      notificationId: "welcome",
      payload: { name: "Test" },
    });
    assertNotificationSent(notify, "welcome");
    assertNotificationNotSent(notify, "alert");
    expect(() => assertNotificationSent(notify, "alert")).toThrow("Expected notification");
    expect(() => assertNotificationNotSent(notify, "welcome")).toThrow("NOT to have been sent");
  });
});
