import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import {
  channel,
  createNotifyKit,
  fakeEmailProvider,
  memoryAdapter,
  notification,
} from "@notifykitjs/core";
import { createServerActions } from "../src/server-actions.js";

function buildKit() {
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
        subject: "{{actorName}} mentioned you in {{postTitle}}",
        body: "Open {{postUrl}} to reply.",
      }),
    ],
  });

  const db = memoryAdapter();
  const provider = fakeEmailProvider();

  const notifykit = createNotifyKit({
    notifications: [commentMentioned] as const,
    database: db,
    providers: { email: provider },
  });

  return { notifykit, db, provider };
}

const testPayload = {
  actorName: "Alice",
  postTitle: "My Post",
  postUrl: "/posts/1",
};

describe("createServerActions", () => {
  test("factory module is not marked as a Next server-action export file", async () => {
    const source = await readFile(new URL("../src/server-actions.ts", import.meta.url), "utf8");

    expect(source.startsWith('"use server";')).toBe(false);
    expect(source.startsWith("'use server';")).toBe(false);
  });

  test("send and upsertRecipient are not exposed", () => {
    const { notifykit } = buildKit();
    const actions = createServerActions({
      notifykit,
      identify: () => "user-1",
    });

    expect((actions as any).send).toBeUndefined();
    expect((actions as any).upsertRecipient).toBeUndefined();
  });

  test("getPreferences returns preferences for the identified user", async () => {
    const { notifykit } = buildKit();
    await notifykit.upsertRecipient({ id: "user-1", email: "u@x.com" });

    const actions = createServerActions({
      notifykit,
      identify: () => "user-1",
    });

    const prefs = await actions.getPreferences();
    expect(Array.isArray(prefs)).toBe(true);
  });

  test("updatePreference updates preference for the identified user", async () => {
    const { notifykit } = buildKit();
    await notifykit.upsertRecipient({ id: "user-1", email: "u@x.com" });

    const actions = createServerActions({
      notifykit,
      identify: () => "user-1",
    });

    const pref = await actions.updatePreference({
      notificationId: "comment_mentioned",
      channels: { email: false },
    });

    expect(pref.recipientId).toBe("user-1");
    expect(pref.channels.email).toBe(false);
  });

  test("preference actions accept sms channel preferences", async () => {
    const { notifykit } = buildKit();
    await notifykit.upsertRecipient({ id: "user-1", email: "u@x.com" });

    const actions = createServerActions({
      notifykit,
      identify: () => "user-1",
    });

    const notificationPref = await actions.updatePreference({
      notificationId: "comment_mentioned",
      channels: { sms: false },
    });
    const globalPref = await actions.updateGlobalPreference({
      channels: { sms: true },
    });

    expect(notificationPref.channels.sms).toBe(false);
    expect(globalPref.channels.sms).toBe(true);
  });

  test("identify is called for every user-scoped action", async () => {
    const { notifykit } = buildKit();
    await notifykit.upsertRecipient({ id: "user-1", email: "u@x.com" });

    let identifyCalls = 0;
    const actions = createServerActions({
      notifykit,
      identify: () => {
        identifyCalls++;
        return "user-1";
      },
    });

    await actions.getPreferences();
    expect(identifyCalls).toBe(1);

    await actions.updatePreference({
      notificationId: "comment_mentioned",
      channels: { inbox: true },
    });
    expect(identifyCalls).toBe(2);

    await actions.inbox.list();
    expect(identifyCalls).toBe(3);

    await actions.inbox.unreadCount();
    expect(identifyCalls).toBe(4);
  });

  test("inbox operations use identity binding", async () => {
    const { notifykit } = buildKit();
    await notifykit.upsertRecipient({ id: "user-1", email: "u@x.com" });

    await notifykit.send({
      recipientId: "user-1",
      notificationId: "comment_mentioned",
      payload: testPayload,
    });

    const actions = createServerActions({
      notifykit,
      identify: () => "user-1",
    });

    const items = await actions.inbox.list();
    expect(items.length).toBe(1);

    const count = await actions.inbox.unreadCount();
    expect(count).toBe(1);

    const readResult = await actions.inbox.markRead(items[0].id);
    expect(readResult.status).toBe("marked");

    const archiveResult = await actions.inbox.archive(items[0].id);
    expect(archiveResult.status).toBe("ok");

    const unarchiveResult = await actions.inbox.unarchive(items[0].id);
    expect(unarchiveResult.status).toBe("ok");
  });

  test("inbox.markRead returns forbidden for another user's item", async () => {
    const { notifykit } = buildKit();
    await notifykit.upsertRecipient({ id: "user-1", email: "u1@x.com" });
    await notifykit.upsertRecipient({ id: "user-2", email: "u2@x.com" });

    await notifykit.send({
      recipientId: "user-1",
      notificationId: "comment_mentioned",
      payload: testPayload,
    });

    const user1Items = await notifykit.inbox.list("user-1");
    const itemId = user1Items[0].id;

    const actionsUser2 = createServerActions({
      notifykit,
      identify: () => "user-2",
    });

    const result = await actionsUser2.inbox.markRead(itemId);
    expect(result.status).toBe("forbidden");
  });

  test("inbox.archive returns forbidden for another user's item", async () => {
    const { notifykit } = buildKit();
    await notifykit.upsertRecipient({ id: "user-1", email: "u1@x.com" });
    await notifykit.upsertRecipient({ id: "user-2", email: "u2@x.com" });

    await notifykit.send({
      recipientId: "user-1",
      notificationId: "comment_mentioned",
      payload: testPayload,
    });

    const user1Items = await notifykit.inbox.list("user-1");
    const itemId = user1Items[0].id;

    const actionsUser2 = createServerActions({
      notifykit,
      identify: () => "user-2",
    });

    const result = await actionsUser2.inbox.archive(itemId);
    expect(result.status).toBe("forbidden");
  });

  test("inbox.unarchive returns forbidden for another user's item", async () => {
    const { notifykit } = buildKit();
    await notifykit.upsertRecipient({ id: "user-1", email: "u1@x.com" });
    await notifykit.upsertRecipient({ id: "user-2", email: "u2@x.com" });

    await notifykit.send({
      recipientId: "user-1",
      notificationId: "comment_mentioned",
      payload: testPayload,
    });

    const user1Items = await notifykit.inbox.list("user-1");
    const itemId = user1Items[0].id;

    await notifykit.inbox.archiveForRecipient(itemId, "user-1");

    const actionsUser2 = createServerActions({
      notifykit,
      identify: () => "user-2",
    });

    const result = await actionsUser2.inbox.unarchive(itemId);
    expect(result.status).toBe("forbidden");
  });

  test("inbox.deleteItem returns forbidden for another user's item", async () => {
    const { notifykit } = buildKit();
    await notifykit.upsertRecipient({ id: "user-1", email: "u1@x.com" });
    await notifykit.upsertRecipient({ id: "user-2", email: "u2@x.com" });

    await notifykit.send({
      recipientId: "user-1",
      notificationId: "comment_mentioned",
      payload: testPayload,
    });

    const user1Items = await notifykit.inbox.list("user-1");
    const itemId = user1Items[0].id;

    const actionsUser2 = createServerActions({
      notifykit,
      identify: () => "user-2",
    });

    const result = await actionsUser2.inbox.deleteItem(itemId);
    expect(result.status).toBe("forbidden");
  });

  test("inbox.list does not return another user's items", async () => {
    const { notifykit } = buildKit();
    await notifykit.upsertRecipient({ id: "user-1", email: "u1@x.com" });
    await notifykit.upsertRecipient({ id: "user-2", email: "u2@x.com" });

    await notifykit.send({
      recipientId: "user-1",
      notificationId: "comment_mentioned",
      payload: testPayload,
    });

    const actionsUser2 = createServerActions({
      notifykit,
      identify: () => "user-2",
    });

    const items = await actionsUser2.inbox.list();
    expect(items.length).toBe(0);
  });

  test("inbox.unreadCount does not count another user's items", async () => {
    const { notifykit } = buildKit();
    await notifykit.upsertRecipient({ id: "user-1", email: "u1@x.com" });
    await notifykit.upsertRecipient({ id: "user-2", email: "u2@x.com" });

    await notifykit.send({
      recipientId: "user-1",
      notificationId: "comment_mentioned",
      payload: testPayload,
    });

    const actionsUser2 = createServerActions({
      notifykit,
      identify: () => "user-2",
    });

    const count = await actionsUser2.inbox.unreadCount();
    expect(count).toBe(0);
  });
});

describe("createServerActions — tenant/workspace scope", () => {
  test("identify returning an object threads scope to inbox operations", async () => {
    const { notifykit } = buildKit();
    await notifykit.upsertRecipient({
      id: "user-1",
      email: "u@x.com",
      tenantId: "tenant-a",
    });

    await notifykit.send({
      recipientId: "user-1",
      tenantId: "tenant-a",
      notificationId: "comment_mentioned",
      payload: testPayload,
    });

    const scopedActions = createServerActions({
      notifykit,
      identify: () => ({
        recipientId: "user-1",
        tenantId: "tenant-a",
      }),
    });

    const items = await scopedActions.inbox.list();
    expect(items.length).toBe(1);

    const count = await scopedActions.inbox.unreadCount();
    expect(count).toBe(1);
  });

  test("scoped identity isolates inbox across tenants", async () => {
    const { notifykit } = buildKit();
    await notifykit.upsertRecipient({
      id: "user-1",
      email: "u@x.com",
      tenantId: "tenant-a",
    });

    await notifykit.send({
      recipientId: "user-1",
      tenantId: "tenant-a",
      notificationId: "comment_mentioned",
      payload: testPayload,
    });

    const wrongTenantActions = createServerActions({
      notifykit,
      identify: () => ({
        recipientId: "user-1",
        tenantId: "tenant-b",
      }),
    });

    const items = await wrongTenantActions.inbox.list();
    expect(items.length).toBe(0);

    const count = await wrongTenantActions.inbox.unreadCount();
    expect(count).toBe(0);
  });

  test("scoped identity threads scope to preferences", async () => {
    const { notifykit } = buildKit();
    await notifykit.upsertRecipient({
      id: "user-1",
      email: "u@x.com",
      tenantId: "tenant-a",
    });

    const scopedActions = createServerActions({
      notifykit,
      identify: () => ({
        recipientId: "user-1",
        tenantId: "tenant-a",
      }),
    });

    const pref = await scopedActions.updatePreference({
      notificationId: "comment_mentioned",
      channels: { email: false },
    });

    expect(pref.recipientId).toBe("user-1");
    expect(pref.tenantId).toBe("tenant-a");
    expect(pref.channels.email).toBe(false);
  });

  test("scoped identity isolates preferences across tenants", async () => {
    const { notifykit } = buildKit();
    await notifykit.upsertRecipient({
      id: "user-1",
      email: "u@x.com",
      tenantId: "tenant-a",
    });

    const tenantAActions = createServerActions({
      notifykit,
      identify: () => ({
        recipientId: "user-1",
        tenantId: "tenant-a",
      }),
    });

    await tenantAActions.updatePreference({
      notificationId: "comment_mentioned",
      channels: { email: false },
    });

    const tenantBActions = createServerActions({
      notifykit,
      identify: () => ({
        recipientId: "user-1",
        tenantId: "tenant-b",
      }),
    });

    const prefsB = await tenantBActions.getPreferences();
    const commentPref = prefsB.find((p) => p.notificationId === "comment_mentioned");
    expect(commentPref).toBeUndefined();
  });

  test("string identify still works (backwards compat, no scope)", async () => {
    const { notifykit } = buildKit();
    await notifykit.upsertRecipient({ id: "user-1", email: "u@x.com" });

    const actions = createServerActions({
      notifykit,
      identify: () => "user-1",
    });

    const prefs = await actions.getPreferences();
    expect(Array.isArray(prefs)).toBe(true);
  });
});
