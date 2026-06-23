import { describe, expect, test } from "bun:test";
import {
  channel,
  createNotifyKit,
  createHandler,
  fakeEmailProvider,
  fakeWebhookProvider,
  memoryAdapter,
  notification,
  GLOBAL_PREFERENCE_KEY,
  categoryPreferenceKey,
  isCategoryPreferenceKey,
  isSyntheticPreferenceKey,
  parseCategoryFromKey,
} from "../src/index.js";
import type { ChannelOutcome, DeliveryExplanation, PreferenceExplanation } from "../src/index.js";

const inbox = channel.inbox();
const email = channel.email();
const webhook = channel.webhook();

describe("preference-keys helpers", () => {
  test("GLOBAL_PREFERENCE_KEY is __global__", () => {
    expect(GLOBAL_PREFERENCE_KEY).toBe("__global__");
  });

  test("categoryPreferenceKey builds correct key", () => {
    expect(categoryPreferenceKey("billing")).toBe("__category:billing__");
    expect(categoryPreferenceKey("social")).toBe("__category:social__");
  });

  test("isSyntheticPreferenceKey identifies synthetic keys", () => {
    expect(isSyntheticPreferenceKey("__global__")).toBe(true);
    expect(isSyntheticPreferenceKey("__category:billing__")).toBe(true);
    expect(isSyntheticPreferenceKey("__category:x__")).toBe(true);
    expect(isSyntheticPreferenceKey("comment_mentioned")).toBe(false);
    expect(isSyntheticPreferenceKey("__other__")).toBe(false);
  });
});

describe("notification definition new fields", () => {
  test("notification() accepts required, defaultChannels, classification", () => {
    const def = notification({
      id: "password_reset",
      payload: { code: "string" },
      channels: [email({ subject: "Reset", body: "{{code}}" })],
      required: true,
      defaultChannels: { email: true },
      classification: "transactional",
    });
    expect(def.required).toBe(true);
    expect(def.defaultChannels).toEqual({ email: true });
    expect(def.classification).toBe("transactional");
  });
});

describe("layer precedence", () => {
  test("user notification overrides user global", async () => {
    const def = notification({
      id: "comment",
      payload: { msg: "string" },
      channels: [
        inbox({ title: "{{msg}}" }),
        email({ subject: "{{msg}}", body: "{{msg}}" }),
      ],
    });
    const provider = fakeEmailProvider();
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: memoryAdapter(),
      providers: { email: provider },
    });
    await notify.upsertRecipient({ id: "u1", email: "u@x.com" });

    await notify.preferences.updateGlobal({
      recipientId: "u1",
      channels: { email: true },
    });
    await notify.preferences.update({
      recipientId: "u1",
      notificationId: "comment",
      channels: { email: false },
    });

    const result = await notify.send({
      recipientId: "u1",
      notificationId: "comment",
      payload: { msg: "hi" },
    });
    expect(result.skippedChannels).toContain("email");
    expect(provider.sent).toHaveLength(0);
  });

  test("user category overrides user global but not user notification", async () => {
    const def = notification({
      id: "invoice",
      payload: { msg: "string" },
      channels: [
        inbox({ title: "{{msg}}" }),
        email({ subject: "{{msg}}", body: "{{msg}}" }),
      ],
      category: "billing",
    });
    const provider = fakeEmailProvider();
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: memoryAdapter(),
      providers: { email: provider },
    });
    await notify.upsertRecipient({ id: "u1", email: "u@x.com" });

    await notify.preferences.updateGlobal({
      recipientId: "u1",
      channels: { email: true },
    });
    await notify.preferences.updateCategory({
      recipientId: "u1",
      category: "billing",
      channels: { email: false },
    });

    const result = await notify.send({
      recipientId: "u1",
      notificationId: "invoice",
      payload: { msg: "hi" },
    });
    expect(result.skippedChannels).toContain("email");

    await notify.preferences.update({
      recipientId: "u1",
      notificationId: "invoice",
      channels: { email: true },
    });

    const result2 = await notify.send({
      recipientId: "u1",
      notificationId: "invoice",
      payload: { msg: "hi" },
    });
    expect(result2.skippedChannels).not.toContain("email");
    expect(provider.sent).toHaveLength(1);
  });
});

describe("required notifications", () => {
  test("required override bypasses user opt-out", async () => {
    const def = notification({
      id: "password_reset",
      payload: { code: "string" },
      channels: [email({ subject: "Reset", body: "{{code}}" })],
      required: true,
    });
    const provider = fakeEmailProvider();
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: memoryAdapter(),
      providers: { email: provider },
    });
    await notify.upsertRecipient({ id: "u1", email: "u@x.com" });

    await notify.preferences.update({
      recipientId: "u1",
      notificationId: "password_reset",
      channels: { email: false },
    });

    const result = await notify.send({
      recipientId: "u1",
      notificationId: "password_reset",
      payload: { code: "123456" },
    });
    expect(result.skippedChannels).not.toContain("email");
    expect(result.deliveries).toHaveLength(1);
    expect(provider.sent).toHaveLength(1);
  });

  test("required does not override missing destination", async () => {
    const def = notification({
      id: "password_reset",
      payload: { code: "string" },
      channels: [
        inbox({ title: "Reset: {{code}}" }),
        email({ subject: "Reset", body: "{{code}}" }),
      ],
      required: true,
    });
    const provider = fakeEmailProvider();
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: memoryAdapter(),
      providers: { email: provider },
    });
    await notify.upsertRecipient({ id: "u1" });

    const result = await notify.send({
      recipientId: "u1",
      notificationId: "password_reset",
      payload: { code: "123456" },
    });
    expect(result.skippedChannels).toContain("email");
    expect(result.inboxItems).toHaveLength(1);
    expect(provider.sent).toHaveLength(0);
  });

  test("required + unsubscribe: unsubscribe sets email false but required still sends", async () => {
    const def = notification({
      id: "billing_receipt",
      payload: { amount: "string" },
      channels: [email({ subject: "${{amount}}", body: "Receipt" })],
      required: true,
      classification: "transactional",
    });
    const provider = fakeEmailProvider();
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: memoryAdapter(),
      providers: { email: provider },
    });
    await notify.upsertRecipient({ id: "u1", email: "u@x.com" });

    await notify.preferences.update({
      recipientId: "u1",
      notificationId: "billing_receipt",
      channels: { email: false },
    });

    const result = await notify.send({
      recipientId: "u1",
      notificationId: "billing_receipt",
      payload: { amount: "42.00" },
    });
    expect(result.deliveries).toHaveLength(1);
    expect(provider.sent).toHaveLength(1);
  });
});

describe("app-level defaults", () => {
  test("app default disables webhook when no user pref", async () => {
    const def = notification({
      id: "activity",
      payload: { msg: "string" },
      channels: [
        inbox({ title: "{{msg}}" }),
        webhook({ url: "https://93.184.216.34/hook" }),
      ],
    });
    const webhookProv = fakeWebhookProvider();
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: memoryAdapter(),
      providers: { webhook: webhookProv },
      defaults: { channels: { webhook: false } },
    });
    await notify.upsertRecipient({ id: "u1" });

    const result = await notify.send({
      recipientId: "u1",
      notificationId: "activity",
      payload: { msg: "hi" },
    });
    expect(result.skippedChannels).toContain("webhook");
    expect(webhookProv.sent).toHaveLength(0);
    expect(result.inboxItems).toHaveLength(1);
  });
});

describe("notification defaultChannels", () => {
  test("notification-level default disables email for specific notification", async () => {
    const def1 = notification({
      id: "noisy",
      payload: { msg: "string" },
      channels: [
        inbox({ title: "{{msg}}" }),
        email({ subject: "{{msg}}", body: "{{msg}}" }),
      ],
      defaultChannels: { email: false },
    });
    const def2 = notification({
      id: "important",
      payload: { msg: "string" },
      channels: [
        inbox({ title: "{{msg}}" }),
        email({ subject: "{{msg}}", body: "{{msg}}" }),
      ],
    });
    const provider = fakeEmailProvider();
    const notify = createNotifyKit({
      notifications: [def1, def2] as const,
      database: memoryAdapter(),
      providers: { email: provider },
    });
    await notify.upsertRecipient({ id: "u1", email: "u@x.com" });

    const r1 = await notify.send({
      recipientId: "u1",
      notificationId: "noisy",
      payload: { msg: "hi" },
    });
    expect(r1.skippedChannels).toContain("email");

    const r2 = await notify.send({
      recipientId: "u1",
      notificationId: "important",
      payload: { msg: "hi" },
    });
    expect(r2.skippedChannels).not.toContain("email");
    expect(provider.sent).toHaveLength(1);
  });
});

describe("category defaults from config", () => {
  test("category default disables inbox for marketing", async () => {
    const def = notification({
      id: "promo",
      payload: { msg: "string" },
      channels: [
        inbox({ title: "{{msg}}" }),
        email({ subject: "{{msg}}", body: "{{msg}}" }),
      ],
      category: "marketing",
    });
    const provider = fakeEmailProvider();
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: memoryAdapter(),
      providers: { email: provider },
      defaults: { categories: { marketing: { inbox: false } } },
    });
    await notify.upsertRecipient({ id: "u1", email: "u@x.com" });

    const result = await notify.send({
      recipientId: "u1",
      notificationId: "promo",
      payload: { msg: "Sale!" },
    });
    expect(result.skippedChannels).toContain("inbox");
    expect(result.inboxItems).toHaveLength(0);
    expect(result.deliveries).toHaveLength(2);
    expect(result.deliveries.filter((d) => d.status === "sent")).toHaveLength(1);
    expect(result.deliveries.filter((d) => d.status === "skipped")).toHaveLength(1);
  });
});

describe("tenant defaults", () => {
  test("tenant default disables webhook for specific tenant", async () => {
    const def = notification({
      id: "activity",
      payload: { msg: "string" },
      channels: [
        inbox({ title: "{{msg}}" }),
        webhook({ url: "https://93.184.216.34/hook" }),
      ],
    });
    const webhookProv = fakeWebhookProvider();
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: memoryAdapter(),
      providers: { webhook: webhookProv },
      tenantDefaults: (tenantId) =>
        tenantId === "t1" ? { webhook: false } : null,
    });
    await notify.upsertRecipient({ id: "u1", tenantId: "t1" });
    await notify.upsertRecipient({ id: "u2", tenantId: "t2" });

    const r1 = await notify.send({
      recipientId: "u1",
      notificationId: "activity",
      payload: { msg: "hi" },
    });
    expect(r1.skippedChannels).toContain("webhook");

    const r2 = await notify.send({
      recipientId: "u2",
      notificationId: "activity",
      payload: { msg: "hi" },
    });
    expect(r2.skippedChannels).not.toContain("webhook");
    expect(webhookProv.sent).toHaveLength(1);
  });
});

describe("preferences.explain()", () => {
  test("returns correct trail with multiple layers", async () => {
    const def = notification({
      id: "comment",
      payload: { msg: "string" },
      channels: [
        inbox({ title: "{{msg}}" }),
        email({ subject: "{{msg}}", body: "{{msg}}" }),
      ],
      category: "social",
    });
    const provider = fakeEmailProvider();
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: memoryAdapter(),
      providers: { email: provider },
      defaults: {
        channels: { email: true },
        categories: { social: { email: true } },
      },
    });
    await notify.upsertRecipient({ id: "u1", email: "u@x.com" });

    await notify.preferences.updateGlobal({
      recipientId: "u1",
      channels: { email: true },
    });
    await notify.preferences.updateCategory({
      recipientId: "u1",
      category: "social",
      channels: { email: false },
    });

    const explanation = await notify.preferences.explain({
      recipientId: "u1",
      notificationId: "comment",
    });

    expect(explanation.recipientId).toBe("u1");
    expect(explanation.notificationId).toBe("comment");
    expect(explanation.category).toBe("social");
    expect(explanation.required).toBe(false);

    const emailRes = explanation.channels.find((c) => c.channel === "email")!;
    expect(emailRes.allowed).toBe(false);
    expect(emailRes.resolvedBy).toBe("user_category");
    expect(emailRes.reason).toMatch(/disabled.*user.*social.*category/i);

    expect(emailRes.trail.length).toBeGreaterThanOrEqual(6);
    const layers = emailRes.trail.map((t) => t.layer);
    expect(layers).toContain("app_default");
    expect(layers).toContain("category_default");
    expect(layers).toContain("user_global");
    expect(layers).toContain("user_category");

    const inboxRes = explanation.channels.find((c) => c.channel === "inbox")!;
    expect(inboxRes.allowed).toBe(true);
  });

  test("explain shows required override in trail", async () => {
    const def = notification({
      id: "reset",
      payload: { code: "string" },
      channels: [email({ subject: "Reset", body: "{{code}}" })],
      required: true,
    });
    const provider = fakeEmailProvider();
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: memoryAdapter(),
      providers: { email: provider },
    });
    await notify.upsertRecipient({ id: "u1", email: "u@x.com" });

    await notify.preferences.update({
      recipientId: "u1",
      notificationId: "reset",
      channels: { email: false },
    });

    const explanation = await notify.preferences.explain({
      recipientId: "u1",
      notificationId: "reset",
    });
    expect(explanation.required).toBe(true);

    const emailRes = explanation.channels.find((c) => c.channel === "email")!;
    expect(emailRes.allowed).toBe(true);
    expect(emailRes.resolvedBy).toBe("required_override");
    expect(emailRes.reason).toMatch(/required/i);
  });

  test("explain shows destination_unavailable", async () => {
    const def = notification({
      id: "reset",
      payload: { code: "string" },
      channels: [
        inbox({ title: "{{code}}" }),
        email({ subject: "Reset", body: "{{code}}" }),
      ],
      required: true,
    });
    const provider = fakeEmailProvider();
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: memoryAdapter(),
      providers: { email: provider },
    });
    await notify.upsertRecipient({ id: "u1" });

    const explanation = await notify.preferences.explain({
      recipientId: "u1",
      notificationId: "reset",
    });
    const emailRes = explanation.channels.find((c) => c.channel === "email")!;
    expect(emailRes.allowed).toBe(false);
    expect(emailRes.resolvedBy).toBe("destination_unavailable");
  });
});

describe("updateGlobal and updateCategory", () => {
  test("updateGlobal stores with synthetic key, list() hides it", async () => {
    const def = notification({
      id: "test",
      payload: { msg: "string" },
      channels: [inbox({ title: "{{msg}}" })],
    });
    const db = memoryAdapter();
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: db,
    });
    await notify.upsertRecipient({ id: "u1" });

    await notify.preferences.updateGlobal({
      recipientId: "u1",
      channels: { inbox: false },
    });

    const listed = await notify.preferences.list("u1");
    expect(listed).toHaveLength(0);

    const raw = db._state.preferences;
    const globalPref = raw.find(
      (p) => p.notificationId === GLOBAL_PREFERENCE_KEY,
    );
    expect(globalPref).toBeDefined();
    expect(globalPref!.channels.inbox).toBe(false);
  });

  test("updateCategory stores with synthetic key, list() hides it", async () => {
    const def = notification({
      id: "test",
      payload: { msg: "string" },
      channels: [inbox({ title: "{{msg}}" })],
      category: "billing",
    });
    const db = memoryAdapter();
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: db,
    });
    await notify.upsertRecipient({ id: "u1" });

    await notify.preferences.updateCategory({
      recipientId: "u1",
      category: "billing",
      channels: { inbox: false },
    });

    const listed = await notify.preferences.list("u1");
    expect(listed).toHaveLength(0);

    const raw = db._state.preferences;
    const catPref = raw.find(
      (p) => p.notificationId === categoryPreferenceKey("billing"),
    );
    expect(catPref).toBeDefined();
    expect(catPref!.channels.inbox).toBe(false);
  });

  test("updateGlobal throws for unknown recipient", async () => {
    const def = notification({
      id: "test",
      payload: { msg: "string" },
      channels: [inbox({ title: "{{msg}}" })],
    });
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: memoryAdapter(),
    });
    await expect(
      notify.preferences.updateGlobal({
        recipientId: "ghost",
        channels: { inbox: false },
      }),
    ).rejects.toThrow(/Unknown recipient/);
  });

  test("updateCategory throws for unknown category", async () => {
    const def = notification({
      id: "test",
      payload: { msg: "string" },
      channels: [inbox({ title: "{{msg}}" })],
      category: "billing",
    });
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: memoryAdapter(),
    });
    await notify.upsertRecipient({ id: "u1" });
    await expect(
      notify.preferences.updateCategory({
        recipientId: "u1",
        category: "nonexistent",
        channels: { inbox: false },
      }),
    ).rejects.toThrow(/Unknown category/);
  });

  test("getGlobal reads back saved global preference", async () => {
    const def = notification({
      id: "test",
      payload: { msg: "string" },
      channels: [inbox({ title: "{{msg}}" })],
    });
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: memoryAdapter(),
    });
    await notify.upsertRecipient({ id: "u1" });

    const before = await notify.preferences.getGlobal({ recipientId: "u1" });
    expect(before).toBeNull();

    await notify.preferences.updateGlobal({
      recipientId: "u1",
      channels: { inbox: false },
    });

    const after = await notify.preferences.getGlobal({ recipientId: "u1" });
    expect(after).not.toBeNull();
    expect(after!.channels.inbox).toBe(false);
  });

  test("getCategory reads back saved category preference", async () => {
    const def = notification({
      id: "test",
      payload: { msg: "string" },
      channels: [inbox({ title: "{{msg}}" })],
      category: "billing",
    });
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: memoryAdapter(),
    });
    await notify.upsertRecipient({ id: "u1" });

    const before = await notify.preferences.getCategory({
      recipientId: "u1",
      category: "billing",
    });
    expect(before).toBeNull();

    await notify.preferences.updateCategory({
      recipientId: "u1",
      category: "billing",
      channels: { inbox: false },
    });

    const after = await notify.preferences.getCategory({
      recipientId: "u1",
      category: "billing",
    });
    expect(after).not.toBeNull();
    expect(after!.channels.inbox).toBe(false);
  });

  test("getCategory throws for unknown category", async () => {
    const def = notification({
      id: "test",
      payload: { msg: "string" },
      channels: [inbox({ title: "{{msg}}" })],
      category: "billing",
    });
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: memoryAdapter(),
    });
    await notify.upsertRecipient({ id: "u1" });
    await expect(
      notify.preferences.getCategory({
        recipientId: "u1",
        category: "nonexistent",
      }),
    ).rejects.toThrow(/Unknown category/);
  });

  test("listCategories returns only category preferences", async () => {
    const def = notification({
      id: "test",
      payload: { msg: "string" },
      channels: [inbox({ title: "{{msg}}" }), email({ subject: "s", body: "b" })],
      category: "billing",
    });
    const provider = fakeEmailProvider();
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: memoryAdapter(),
      providers: { email: provider },
    });
    await notify.upsertRecipient({ id: "u1", email: "u@test.com" });

    await notify.preferences.update({
      recipientId: "u1",
      notificationId: "test",
      channels: { email: true },
    });
    await notify.preferences.updateGlobal({
      recipientId: "u1",
      channels: { inbox: true },
    });
    await notify.preferences.updateCategory({
      recipientId: "u1",
      category: "billing",
      channels: { inbox: false },
    });

    const categories = await notify.preferences.listCategories("u1");
    expect(categories).toHaveLength(1);
    expect(categories[0].notificationId).toBe(categoryPreferenceKey("billing"));
    expect(categories[0].channels.inbox).toBe(false);

    const regular = await notify.preferences.list("u1");
    expect(regular.every((p) => !isSyntheticPreferenceKey(p.notificationId))).toBe(true);
  });
});

describe("synthetic notification ID validation", () => {
  test("rejects notification id that matches __global__", () => {
    expect(() =>
      createNotifyKit({
        notifications: [
          notification({
            id: "__global__",
            payload: { msg: "string" },
            channels: [inbox({ title: "{{msg}}" })],
          }),
        ] as const,
        database: memoryAdapter(),
      }),
    ).toThrow(/reserved for internal preference keys/);
  });

  test("rejects notification id that matches __category:*__ pattern", () => {
    expect(() =>
      createNotifyKit({
        notifications: [
          notification({
            id: "__category:billing__",
            payload: { msg: "string" },
            channels: [inbox({ title: "{{msg}}" })],
          }),
        ] as const,
        database: memoryAdapter(),
      }),
    ).toThrow(/reserved for internal preference keys/);
  });
});

describe("preference-keys new helpers", () => {
  test("isCategoryPreferenceKey identifies category keys", () => {
    expect(isCategoryPreferenceKey("__category:billing__")).toBe(true);
    expect(isCategoryPreferenceKey("__category:x__")).toBe(true);
    expect(isCategoryPreferenceKey("__global__")).toBe(false);
    expect(isCategoryPreferenceKey("test")).toBe(false);
  });

  test("parseCategoryFromKey extracts category name", () => {
    expect(parseCategoryFromKey("__category:billing__")).toBe("billing");
    expect(parseCategoryFromKey("__category:social__")).toBe("social");
    expect(parseCategoryFromKey("__global__")).toBeNull();
    expect(parseCategoryFromKey("test")).toBeNull();
  });
});

describe("scoped read-after-write for global/category preferences", () => {
  function buildScoped() {
    const def = notification({
      id: "alert",
      payload: { msg: "string" },
      channels: [inbox({ title: "{{msg}}" })],
      category: "billing",
    });
    const db = memoryAdapter();
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: db,
    });
    return { notify, db };
  }

  test("getGlobal resolves tenant scope from recipient", async () => {
    const { notify } = buildScoped();
    await notify.upsertRecipient({ id: "u1", tenantId: "t1" });

    await notify.preferences.updateGlobal({
      recipientId: "u1",
      channels: { inbox: false },
    });

    const pref = await notify.preferences.getGlobal({ recipientId: "u1" });
    expect(pref).not.toBeNull();
    expect(pref!.channels.inbox).toBe(false);
  });

  test("getCategory resolves tenant scope from recipient", async () => {
    const { notify } = buildScoped();
    await notify.upsertRecipient({ id: "u1", tenantId: "t1" });

    await notify.preferences.updateCategory({
      recipientId: "u1",
      category: "billing",
      channels: { inbox: false },
    });

    const pref = await notify.preferences.getCategory({
      recipientId: "u1",
      category: "billing",
    });
    expect(pref).not.toBeNull();
    expect(pref!.channels.inbox).toBe(false);
  });

  test("listCategories resolves tenant scope from recipient", async () => {
    const { notify } = buildScoped();
    await notify.upsertRecipient({ id: "u1", tenantId: "t1" });

    await notify.preferences.updateCategory({
      recipientId: "u1",
      category: "billing",
      channels: { inbox: false },
    });

    const cats = await notify.preferences.listCategories("u1");
    expect(cats).toHaveLength(1);
    expect(cats[0].channels.inbox).toBe(false);
  });

  test("getGlobal resolves workspace scope from recipient", async () => {
    const { notify } = buildScoped();
    await notify.upsertRecipient({ id: "u1", workspaceId: "w1" });

    await notify.preferences.updateGlobal({
      recipientId: "u1",
      channels: { inbox: false },
    });

    const pref = await notify.preferences.getGlobal({ recipientId: "u1" });
    expect(pref).not.toBeNull();
    expect(pref!.channels.inbox).toBe(false);
  });

  test("returns null/empty for unknown recipient", async () => {
    const { notify } = buildScoped();

    const globalPref = await notify.preferences.getGlobal({ recipientId: "ghost" });
    expect(globalPref).toBeNull();

    const catPref = await notify.preferences.getCategory({
      recipientId: "ghost",
      category: "billing",
    });
    expect(catPref).toBeNull();

    const cats = await notify.preferences.listCategories("ghost");
    expect(cats).toHaveLength(0);
  });
});

describe("backward compatibility", () => {
  test("no config changes = identical behavior to current", async () => {
    const def = notification({
      id: "comment",
      payload: { msg: "string" },
      channels: [
        inbox({ title: "{{msg}}" }),
        email({ subject: "{{msg}}", body: "{{msg}}" }),
      ],
    });
    const provider = fakeEmailProvider();
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: memoryAdapter(),
      providers: { email: provider },
    });
    await notify.upsertRecipient({ id: "u1", email: "u@x.com" });

    const result = await notify.send({
      recipientId: "u1",
      notificationId: "comment",
      payload: { msg: "hi" },
    });
    expect(result.skippedChannels).toEqual([]);
    expect(result.inboxItems).toHaveLength(1);
    expect(result.deliveries).toHaveLength(1);
    expect(provider.sent).toHaveLength(1);

    await notify.preferences.update({
      recipientId: "u1",
      notificationId: "comment",
      channels: { email: false },
    });

    const result2 = await notify.send({
      recipientId: "u1",
      notificationId: "comment",
      payload: { msg: "hi" },
    });
    expect(result2.skippedChannels).toEqual(["email"]);
  });
});

describe("multi-tenant isolation", () => {
  test("tenant A global pref does not leak to tenant B", async () => {
    const def = notification({
      id: "activity",
      payload: { msg: "string" },
      channels: [
        inbox({ title: "{{msg}}" }),
        email({ subject: "{{msg}}", body: "{{msg}}" }),
      ],
    });
    const provider = fakeEmailProvider();
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: memoryAdapter(),
      providers: { email: provider },
    });
    await notify.upsertRecipient({ id: "u1", tenantId: "tA", email: "u1@x.com" });
    await notify.upsertRecipient({ id: "u2", tenantId: "tB", email: "u2@x.com" });

    await notify.preferences.updateGlobal({
      recipientId: "u1",
      tenantId: "tA",
      channels: { email: false },
    });

    const r1 = await notify.send({
      recipientId: "u1",
      notificationId: "activity",
      payload: { msg: "hi" },
    });
    expect(r1.skippedChannels).toContain("email");

    const r2 = await notify.send({
      recipientId: "u2",
      notificationId: "activity",
      payload: { msg: "hi" },
    });
    expect(r2.skippedChannels).not.toContain("email");
    expect(provider.sent).toHaveLength(1);
  });
});

describe("startup validation", () => {
  test("rejects invalid classification", () => {
    expect(() =>
      createNotifyKit({
        notifications: [
          notification({
            id: "test",
            payload: { msg: "string" },
            channels: [inbox({ title: "{{msg}}" })],
            // @ts-expect-error — testing runtime behavior
            classification: "invalid",
          }),
        ] as const,
        database: memoryAdapter(),
      }),
    ).toThrow(/invalid classification/i);
  });

  test("rejects defaultChannels referencing absent channel type", () => {
    expect(() =>
      createNotifyKit({
        notifications: [
          notification({
            id: "test",
            payload: { msg: "string" },
            channels: [inbox({ title: "{{msg}}" })],
            defaultChannels: { email: false },
          }),
        ] as const,
        database: memoryAdapter(),
      }),
    ).toThrow(/defaultChannels.*email.*only declares/i);
  });

  test("rejects category default for unknown category", () => {
    expect(() =>
      createNotifyKit({
        notifications: [
          notification({
            id: "test",
            payload: { msg: "string" },
            channels: [inbox({ title: "{{msg}}" })],
            category: "billing",
          }),
        ] as const,
        database: memoryAdapter(),
        defaults: { categories: { nonexistent: { inbox: false } } },
      }),
    ).toThrow(/category default.*nonexistent.*does not match/i);
  });

  test("passes with valid new fields", () => {
    expect(() =>
      createNotifyKit({
        notifications: [
          notification({
            id: "receipt",
            payload: { amount: "string" },
            channels: [
              inbox({ title: "${{amount}}" }),
              email({ subject: "Receipt", body: "${{amount}}" }),
            ],
            required: true,
            defaultChannels: { email: true, inbox: true },
            classification: "transactional",
            category: "billing",
          }),
        ] as const,
        database: memoryAdapter(),
        providers: { email: fakeEmailProvider() },
        defaults: {
          channels: { email: true },
          categories: { billing: { email: true } },
        },
      }),
    ).not.toThrow();
  });
});

describe("handler routes", () => {
  function buildHandler() {
    const def = notification({
      id: "comment",
      payload: { msg: "string" },
      channels: [
        inbox({ title: "{{msg}}" }),
        email({ subject: "{{msg}}", body: "{{msg}}" }),
      ],
      category: "social",
      required: false,
      classification: "product",
    });
    const provider = fakeEmailProvider();
    const db = memoryAdapter();
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: db,
      providers: { email: provider },
      defaults: { categories: { social: { email: true } } },
    });
    const handler = createHandler(notify, {
      identify: (req) => {
        const id = req.headers.get("x-user");
        return id ? { recipientId: id } : null;
      },
    });
    return { notify, db, handler };
  }

  test("GET /notifications includes new fields", async () => {
    const { handler } = buildHandler();
    const res = await handler(
      new Request("http://localhost/api/notifykit/notifications"),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: Array<{
        id: string;
        required?: boolean;
        classification?: string;
      }>;
    };
    expect(body.data[0]!.classification).toBe("product");
    expect(body.data[0]!.required).toBe(false);
  });

  test("GET /preferences/explain returns explanation", async () => {
    const { notify, handler } = buildHandler();
    await notify.upsertRecipient({ id: "u1", email: "u@x.com" });

    const res = await handler(
      new Request(
        "http://localhost/api/notifykit/preferences/explain?notificationId=comment",
        { headers: { "x-user": "u1" } },
      ),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: PreferenceExplanation };
    expect(body.data.notificationId).toBe("comment");
    expect(body.data.channels.length).toBeGreaterThan(0);
    const emailRes = body.data.channels.find((c) => c.channel === "email");
    expect(emailRes).toBeDefined();
    expect(emailRes!.trail.length).toBeGreaterThan(0);
  });

  test("GET /preferences/explain without notificationId returns 400", async () => {
    const { notify, handler } = buildHandler();
    await notify.upsertRecipient({ id: "u1" });

    const res = await handler(
      new Request(
        "http://localhost/api/notifykit/preferences/explain",
        { headers: { "x-user": "u1" } },
      ),
    );
    expect(res.status).toBe(400);
  });

  test("POST /preferences/global stores global preference", async () => {
    const { notify, db, handler } = buildHandler();
    await notify.upsertRecipient({ id: "u1" });

    const res = await handler(
      new Request("http://localhost/api/notifykit/preferences/global", {
        method: "POST",
        headers: {
          "x-user": "u1",
          "content-type": "application/json",
        },
        body: JSON.stringify({ channels: { email: false } }),
      }),
    );
    expect(res.status).toBe(200);

    const globalPref = db._state.preferences.find(
      (p) => p.notificationId === GLOBAL_PREFERENCE_KEY,
    );
    expect(globalPref).toBeDefined();
    expect(globalPref!.channels.email).toBe(false);
  });

  test("POST /preferences/category stores category preference", async () => {
    const { notify, db, handler } = buildHandler();
    await notify.upsertRecipient({ id: "u1" });

    const res = await handler(
      new Request("http://localhost/api/notifykit/preferences/category", {
        method: "POST",
        headers: {
          "x-user": "u1",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          category: "social",
          channels: { email: false },
        }),
      }),
    );
    expect(res.status).toBe(200);

    const catPref = db._state.preferences.find(
      (p) => p.notificationId === categoryPreferenceKey("social"),
    );
    expect(catPref).toBeDefined();
    expect(catPref!.channels.email).toBe(false);
  });

  test("POST /preferences/category with invalid body returns 400", async () => {
    const { notify, handler } = buildHandler();
    await notify.upsertRecipient({ id: "u1" });

    const res = await handler(
      new Request("http://localhost/api/notifykit/preferences/category", {
        method: "POST",
        headers: {
          "x-user": "u1",
          "content-type": "application/json",
        },
        body: JSON.stringify({ channels: { email: false } }),
      }),
    );
    expect(res.status).toBe(400);
  });

  test("GET /preferences/global returns saved global preference", async () => {
    const { notify, handler } = buildHandler();
    await notify.upsertRecipient({ id: "u1" });

    const resBefore = await handler(
      new Request("http://localhost/api/notifykit/preferences/global", {
        headers: { "x-user": "u1" },
      }),
    );
    expect(resBefore.status).toBe(200);
    const bodyBefore = (await resBefore.json()) as { data: unknown };
    expect(bodyBefore.data).toBeNull();

    await handler(
      new Request("http://localhost/api/notifykit/preferences/global", {
        method: "POST",
        headers: { "x-user": "u1", "content-type": "application/json" },
        body: JSON.stringify({ channels: { email: false } }),
      }),
    );

    const resAfter = await handler(
      new Request("http://localhost/api/notifykit/preferences/global", {
        headers: { "x-user": "u1" },
      }),
    );
    expect(resAfter.status).toBe(200);
    const bodyAfter = (await resAfter.json()) as {
      data: { channels: { email: boolean } };
    };
    expect(bodyAfter.data.channels.email).toBe(false);
  });

  test("GET /preferences/category returns saved category preference", async () => {
    const { notify, handler } = buildHandler();
    await notify.upsertRecipient({ id: "u1" });

    const resBefore = await handler(
      new Request(
        "http://localhost/api/notifykit/preferences/category?category=social",
        { headers: { "x-user": "u1" } },
      ),
    );
    expect(resBefore.status).toBe(200);
    const bodyBefore = (await resBefore.json()) as { data: unknown };
    expect(bodyBefore.data).toBeNull();

    await handler(
      new Request("http://localhost/api/notifykit/preferences/category", {
        method: "POST",
        headers: { "x-user": "u1", "content-type": "application/json" },
        body: JSON.stringify({ category: "social", channels: { inbox: false } }),
      }),
    );

    const resAfter = await handler(
      new Request(
        "http://localhost/api/notifykit/preferences/category?category=social",
        { headers: { "x-user": "u1" } },
      ),
    );
    expect(resAfter.status).toBe(200);
    const bodyAfter = (await resAfter.json()) as {
      data: { channels: { inbox: boolean } };
    };
    expect(bodyAfter.data.channels.inbox).toBe(false);
  });

  test("GET /preferences/category without category param returns 400", async () => {
    const { notify, handler } = buildHandler();
    await notify.upsertRecipient({ id: "u1" });

    const res = await handler(
      new Request("http://localhost/api/notifykit/preferences/category", {
        headers: { "x-user": "u1" },
      }),
    );
    expect(res.status).toBe(400);
  });

  test("GET /preferences/categories returns only category preferences", async () => {
    const { notify, handler } = buildHandler();
    await notify.upsertRecipient({ id: "u1" });

    await notify.preferences.updateGlobal({
      recipientId: "u1",
      channels: { email: false },
    });
    await notify.preferences.updateCategory({
      recipientId: "u1",
      category: "social",
      channels: { inbox: false },
    });
    await notify.preferences.update({
      recipientId: "u1",
      notificationId: "comment",
      channels: { email: true },
    });

    const res = await handler(
      new Request("http://localhost/api/notifykit/preferences/categories", {
        headers: { "x-user": "u1" },
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: Array<{ notificationId: string }> };
    expect(body.data).toHaveLength(1);
    expect(body.data[0].notificationId).toBe(categoryPreferenceKey("social"));
  });
});

describe("notify.explain() — delivery-level explanation", () => {
  test("basic explain with no constraints returns deliver for all channels", async () => {
    const def = notification({
      id: "comment",
      payload: { msg: "string" },
      channels: [
        inbox({ title: "{{msg}}" }),
        email({ subject: "{{msg}}", body: "{{msg}}" }),
      ],
    });
    const provider = fakeEmailProvider();
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: memoryAdapter(),
      providers: { email: provider },
    });
    await notify.upsertRecipient({ id: "u1", email: "u@x.com" });

    const result = await notify.explain({
      recipientId: "u1",
      notificationId: "comment",
      payload: { msg: "hi" },
    });
    expect(result.wouldRateLimit).toBe(false);
    expect(result.wouldDigest).toBe(false);
    expect(result.rateLimit).toBeNull();
    expect(result.digest).toBeNull();
    expect(result.quietHours).toBeNull();
    expect(result.channels.every((c) => c.outcome === "deliver")).toBe(true);
  });

  test("explain shows rate limit status", async () => {
    const def = notification({
      id: "alert",
      payload: { msg: "string" },
      channels: [inbox({ title: "{{msg}}" })],
      rateLimit: { max: 2, windowMs: 60_000 },
    });
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: memoryAdapter(),
    });
    await notify.upsertRecipient({ id: "u1" });

    const r1 = await notify.explain({
      recipientId: "u1",
      notificationId: "alert",
      payload: { msg: "hi" },
    });
    expect(r1.wouldRateLimit).toBe(false);
    expect(r1.rateLimit).toEqual({ current: 0, max: 2, windowMs: 60_000 });

    await notify.send({ recipientId: "u1", notificationId: "alert", payload: { msg: "1" } });
    await notify.send({ recipientId: "u1", notificationId: "alert", payload: { msg: "2" } });

    const r2 = await notify.explain({
      recipientId: "u1",
      notificationId: "alert",
      payload: { msg: "hi" },
    });
    expect(r2.wouldRateLimit).toBe(true);
    expect(r2.rateLimit!.current).toBe(2);
    expect(r2.rateLimit!.max).toBe(2);

    const inboxCh = r2.channels.find((c) => c.channel === "inbox")!;
    expect(inboxCh.outcome).toBe("rate_limited" as ChannelOutcome);
  });

  test("explain shows digest info", async () => {
    const def = notification({
      id: "activity",
      payload: { msg: "string" },
      channels: [inbox({ title: "{{msg}}" })],
      digest: {
        windowMs: 30_000,
        render: ({ payloads, count }) => ({
          msg: `${count} activities`,
        }),
      },
    });
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: memoryAdapter(),
    });
    await notify.upsertRecipient({ id: "u1" });

    const result = await notify.explain({
      recipientId: "u1",
      notificationId: "activity",
      payload: { msg: "hi" },
    });
    expect(result.wouldDigest).toBe(true);
    expect(result.digest).toEqual({ windowMs: 30_000 });

    const inboxCh = result.channels.find((c) => c.channel === "inbox")!;
    expect(inboxCh.outcome).toBe("digested" as ChannelOutcome);
  });

  test("explain shows quiet hours with delayed outcome", async () => {
    const now = new Date();
    const startH = now.getUTCHours();
    const endH = (startH + 2) % 24;
    const fmt = (h: number) => `${String(h).padStart(2, "0")}:00`;

    const def = notification({
      id: "update",
      payload: { msg: "string" },
      channels: [
        inbox({ title: "{{msg}}" }),
        email({ subject: "{{msg}}", body: "{{msg}}" }),
      ],
    });
    const provider = fakeEmailProvider();
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: memoryAdapter(),
      providers: { email: provider },
    });
    await notify.upsertRecipient({
      id: "u1",
      email: "u@x.com",
      quietHours: { start: fmt(startH), end: fmt(endH), timezone: "UTC" },
    });

    const result = await notify.explain({
      recipientId: "u1",
      notificationId: "update",
      payload: { msg: "hi" },
    });
    expect(result.quietHours).not.toBeNull();
    expect(result.quietHours!.active).toBe(true);
    expect(result.quietHours!.resumesAt).toBeInstanceOf(Date);

    const inboxCh = result.channels.find((c) => c.channel === "inbox")!;
    expect(inboxCh.outcome).toBe("deliver");

    const emailCh = result.channels.find((c) => c.channel === "email")!;
    expect(emailCh.outcome).toBe("delayed");
  });

  test("explain shows deduplicated outcome on channels", async () => {
    const def = notification({
      id: "mention",
      payload: { msg: "string" },
      channels: [inbox({ title: "{{msg}}" }), email({ subject: "{{msg}}", body: "{{msg}}" })],
    });
    const provider = fakeEmailProvider();
    const db = memoryAdapter();
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: db,
      providers: { email: provider },
    });
    await notify.upsertRecipient({ id: "u1", email: "u@x.com" });

    const r1 = await notify.explain({
      recipientId: "u1",
      notificationId: "mention",
      payload: { msg: "hi" },
      dedupeKey: "dup-explain",
      dedupeWindowMs: 60_000,
    });
    expect(r1.wouldDeduplicate).toBe(false);
    expect(r1.dedupe).toEqual({ key: "dup-explain", windowMs: 60_000 });
    expect(r1.channels.every((c) => c.outcome === "deliver")).toBe(true);

    await notify.send({
      recipientId: "u1",
      notificationId: "mention",
      payload: { msg: "hi" },
      dedupeKey: "dup-explain",
      dedupeWindowMs: 60_000,
    });

    const r2 = await notify.explain({
      recipientId: "u1",
      notificationId: "mention",
      payload: { msg: "hi" },
      dedupeKey: "dup-explain",
      dedupeWindowMs: 60_000,
    });
    expect(r2.wouldDeduplicate).toBe(true);
    expect(r2.channels.every((c) => c.outcome === ("deduplicated" as ChannelOutcome))).toBe(true);
  });

  test("fully opted-out recipient does not consume rate-limit budget", async () => {
    const def = notification({
      id: "alert",
      payload: { msg: "string" },
      channels: [
        email({ subject: "{{msg}}", body: "{{msg}}" }),
      ],
      rateLimit: { max: 2, windowMs: 60_000 },
    });
    const provider = fakeEmailProvider();
    const db = memoryAdapter();
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: db,
      providers: { email: provider },
    });
    await notify.upsertRecipient({ id: "u1", email: "u@x.com" });
    await notify.preferences.update({
      recipientId: "u1",
      notificationId: "alert",
      channels: { email: false },
    });

    await notify.send({ recipientId: "u1", notificationId: "alert", payload: { msg: "1" } });
    await notify.send({ recipientId: "u1", notificationId: "alert", payload: { msg: "2" } });
    await notify.send({ recipientId: "u1", notificationId: "alert", payload: { msg: "3" } });

    const count = await db.rateLimits.count({ key: `u1:alert`, windowMs: 60_000 });
    expect(count).toBe(0);
    expect(provider.sent).toHaveLength(0);

    await notify.preferences.update({
      recipientId: "u1",
      notificationId: "alert",
      channels: { email: true },
    });
    const r = await notify.send({ recipientId: "u1", notificationId: "alert", payload: { msg: "4" } });
    expect(r.rateLimited).toBe(false);
    expect(provider.sent).toHaveLength(1);
  });

  test("fully opted-out recipient does not create digest entries", async () => {
    const def = notification({
      id: "activity",
      payload: { msg: "string" },
      channels: [
        email({ subject: "{{msg}}", body: "{{msg}}" }),
      ],
      digest: {
        windowMs: 30_000,
        render: ({ count }) => ({ msg: `${count} items` }),
      },
    });
    const provider = fakeEmailProvider();
    const db = memoryAdapter();
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: db,
      providers: { email: provider },
    });
    await notify.upsertRecipient({ id: "u1", email: "u@x.com" });
    await notify.preferences.update({
      recipientId: "u1",
      notificationId: "activity",
      channels: { email: false },
    });

    const r = await notify.send({
      recipientId: "u1",
      notificationId: "activity",
      payload: { msg: "hi" },
    });
    expect(r.digested).toBe(false);
    expect(r.skippedChannels).toContain("email");

    const digests = await db.digests.list();
    expect(digests).toHaveLength(0);
  });

  test("quiet hours does not defer a preference-disabled channel", async () => {
    const now = new Date();
    const startH = now.getUTCHours();
    const endH = (startH + 2) % 24;
    const fmt = (h: number) => `${String(h).padStart(2, "0")}:00`;

    const def = notification({
      id: "update",
      payload: { msg: "string" },
      channels: [
        inbox({ title: "{{msg}}" }),
        email({ subject: "{{msg}}", body: "{{msg}}" }),
      ],
    });
    const provider = fakeEmailProvider();
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: memoryAdapter(),
      providers: { email: provider },
    });
    await notify.upsertRecipient({
      id: "u1",
      email: "u@x.com",
      quietHours: { start: fmt(startH), end: fmt(endH), timezone: "UTC" },
    });
    await notify.preferences.update({
      recipientId: "u1",
      notificationId: "update",
      channels: { email: false },
    });

    const result = await notify.send({
      recipientId: "u1",
      notificationId: "update",
      payload: { msg: "hi" },
    });
    expect(result.skippedChannels).toContain("email");
    expect(result.deferredChannels).not.toContain("email");
    expect(provider.sent).toHaveLength(0);
  });

  test("explain shows disabled outcome from user preference", async () => {
    const def = notification({
      id: "comment",
      payload: { msg: "string" },
      channels: [
        inbox({ title: "{{msg}}" }),
        email({ subject: "{{msg}}", body: "{{msg}}" }),
      ],
    });
    const provider = fakeEmailProvider();
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: memoryAdapter(),
      providers: { email: provider },
    });
    await notify.upsertRecipient({ id: "u1", email: "u@x.com" });
    await notify.preferences.update({
      recipientId: "u1",
      notificationId: "comment",
      channels: { email: false },
    });

    const result = await notify.explain({
      recipientId: "u1",
      notificationId: "comment",
      payload: { msg: "hi" },
    });
    const emailCh = result.channels.find((c) => c.channel === "email")!;
    expect(emailCh.outcome).toBe("disabled");
    expect(emailCh.allowed).toBe(false);

    const inboxCh = result.channels.find((c) => c.channel === "inbox")!;
    expect(inboxCh.outcome).toBe("deliver");
  });

  test("explain shows unavailable outcome for missing destination", async () => {
    const def = notification({
      id: "comment",
      payload: { msg: "string" },
      channels: [
        inbox({ title: "{{msg}}" }),
        email({ subject: "{{msg}}", body: "{{msg}}" }),
      ],
    });
    const provider = fakeEmailProvider();
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: memoryAdapter(),
      providers: { email: provider },
    });
    await notify.upsertRecipient({ id: "u1" });

    const result = await notify.explain({
      recipientId: "u1",
      notificationId: "comment",
      payload: { msg: "hi" },
    });
    const emailCh = result.channels.find((c) => c.channel === "email")!;
    expect(emailCh.outcome).toBe("unavailable");
  });

  test("explain does not write any records", async () => {
    const def = notification({
      id: "comment",
      payload: { msg: "string" },
      channels: [inbox({ title: "{{msg}}" })],
      rateLimit: { max: 5, windowMs: 60_000 },
    });
    const db = memoryAdapter();
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: db,
    });
    await notify.upsertRecipient({ id: "u1" });

    await notify.explain({
      recipientId: "u1",
      notificationId: "comment",
      payload: { msg: "hi" },
    });
    await notify.explain({
      recipientId: "u1",
      notificationId: "comment",
      payload: { msg: "hi" },
    });

    expect(db._state.notifications).toHaveLength(0);
    expect(db._state.deliveries).toHaveLength(0);
    expect(db._state.inboxItems).toHaveLength(0);
    const rateLimitCount = await db.rateLimits.count({
      key: `u1:comment`,
      windowMs: 60_000,
    });
    expect(rateLimitCount).toBe(0);
  });

  test("explain with all constraints simultaneously", async () => {
    const now = new Date();
    const startH = now.getUTCHours();
    const endH = (startH + 2) % 24;
    const fmt = (h: number) => `${String(h).padStart(2, "0")}:00`;

    const def = notification({
      id: "noisy",
      payload: { msg: "string" },
      channels: [
        inbox({ title: "{{msg}}" }),
        email({ subject: "{{msg}}", body: "{{msg}}" }),
      ],
      rateLimit: { max: 1, windowMs: 60_000 },
      digest: {
        windowMs: 10_000,
        render: ({ count }) => ({ msg: `${count} items` }),
      },
      required: true,
    });
    const provider = fakeEmailProvider();
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: memoryAdapter(),
      providers: { email: provider },
    });
    await notify.upsertRecipient({
      id: "u1",
      email: "u@x.com",
      quietHours: { start: fmt(startH), end: fmt(endH), timezone: "UTC" },
    });

    const result = await notify.explain({
      recipientId: "u1",
      notificationId: "noisy",
      payload: { msg: "hi" },
    });
    expect(result.wouldDigest).toBe(true);
    expect(result.digest).toEqual({ windowMs: 10_000 });
    expect(result.rateLimit).toEqual({ current: 0, max: 1, windowMs: 60_000 });
    expect(result.quietHours!.active).toBe(true);
    expect(result.required).toBe(true);

    const emailCh = result.channels.find((c) => c.channel === "email")!;
    expect(emailCh.allowed).toBe(true);
    expect(emailCh.outcome).toBe("digested" as ChannelOutcome);
  });
});

describe("notify.explain() — idempotency reporting", () => {
  test("no idempotencyKey returns wouldReplayIdempotent: false and null info", async () => {
    const def = notification({
      id: "alert",
      payload: { msg: "string" },
      channels: [inbox({ title: "{{msg}}" }), email({ subject: "{{msg}}", body: "{{msg}}" })],
    });
    const provider = fakeEmailProvider();
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: memoryAdapter(),
      providers: { email: provider },
    });
    await notify.upsertRecipient({ id: "u1", email: "u@x.com" });

    const result = await notify.explain({
      recipientId: "u1",
      notificationId: "alert",
      payload: { msg: "hi" },
    });
    expect(result.wouldReplayIdempotent).toBe(false);
    expect(result.idempotency).toBeNull();
  });

  test("idempotencyKey with no prior send returns wouldReplayIdempotent: false", async () => {
    const def = notification({
      id: "alert",
      payload: { msg: "string" },
      channels: [inbox({ title: "{{msg}}" }), email({ subject: "{{msg}}", body: "{{msg}}" })],
    });
    const provider = fakeEmailProvider();
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: memoryAdapter(),
      providers: { email: provider },
    });
    await notify.upsertRecipient({ id: "u1", email: "u@x.com" });

    const result = await notify.explain({
      recipientId: "u1",
      notificationId: "alert",
      payload: { msg: "hi" },
      idempotencyKey: "key-new",
    });
    expect(result.wouldReplayIdempotent).toBe(false);
    expect(result.idempotency).toBeNull();
    expect(result.channels.every((c) => c.outcome === "deliver")).toBe(true);
  });

  test("idempotencyKey matching existing send within TTL reports idempotent", async () => {
    const def = notification({
      id: "alert",
      payload: { msg: "string" },
      channels: [inbox({ title: "{{msg}}" }), email({ subject: "{{msg}}", body: "{{msg}}" })],
    });
    const provider = fakeEmailProvider();
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: memoryAdapter(),
      providers: { email: provider },
    });
    await notify.upsertRecipient({ id: "u1", email: "u@x.com" });

    const sendResult = await notify.send({
      recipientId: "u1",
      notificationId: "alert",
      payload: { msg: "hi" },
      idempotencyKey: "key-1",
    });

    const result = await notify.explain({
      recipientId: "u1",
      notificationId: "alert",
      payload: { msg: "hi" },
      idempotencyKey: "key-1",
    });
    expect(result.wouldReplayIdempotent).toBe(true);
    expect(result.idempotency).not.toBeNull();
    expect(result.idempotency!.key).toBe("key-1");
    expect(result.idempotency!.existingNotificationId).toBe(sendResult.notification!.id);
    expect(result.idempotency!.ttlMs).toBe(24 * 60 * 60 * 1000);
    expect(
      result.channels
        .filter((c) => c.allowed)
        .every((c) => c.outcome === ("idempotent" as ChannelOutcome)),
    ).toBe(true);
  });

  test("idempotencyKey expired beyond TTL returns wouldReplayIdempotent: false", async () => {
    const def = notification({
      id: "alert",
      payload: { msg: "string" },
      channels: [inbox({ title: "{{msg}}" })],
    });
    const db = memoryAdapter();
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: db,
      idempotencyKeyTtlMs: 1,
    });
    await notify.upsertRecipient({ id: "u1" });

    await notify.send({
      recipientId: "u1",
      notificationId: "alert",
      payload: { msg: "hi" },
      idempotencyKey: "key-expire",
    });

    await new Promise((r) => setTimeout(r, 5));

    const result = await notify.explain({
      recipientId: "u1",
      notificationId: "alert",
      payload: { msg: "hi" },
      idempotencyKey: "key-expire",
    });
    expect(result.wouldReplayIdempotent).toBe(false);
    expect(result.idempotency).toBeNull();
  });

  test("idempotencyKey scoped per recipient — different recipients are independent", async () => {
    const def = notification({
      id: "alert",
      payload: { msg: "string" },
      channels: [inbox({ title: "{{msg}}" })],
    });
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: memoryAdapter(),
    });
    await notify.upsertRecipient({ id: "u1" });
    await notify.upsertRecipient({ id: "u2" });

    await notify.send({
      recipientId: "u1",
      notificationId: "alert",
      payload: { msg: "hi" },
      idempotencyKey: "shared-key",
    });

    const r1 = await notify.explain({
      recipientId: "u1",
      notificationId: "alert",
      payload: { msg: "hi" },
      idempotencyKey: "shared-key",
    });
    expect(r1.wouldReplayIdempotent).toBe(true);

    const r2 = await notify.explain({
      recipientId: "u2",
      notificationId: "alert",
      payload: { msg: "hi" },
      idempotencyKey: "shared-key",
    });
    expect(r2.wouldReplayIdempotent).toBe(false);
  });

  test("idempotencyKey scoped per notification — different notifications are independent", async () => {
    const def1 = notification({
      id: "alert",
      payload: { msg: "string" },
      channels: [inbox({ title: "{{msg}}" })],
    });
    const def2 = notification({
      id: "reminder",
      payload: { msg: "string" },
      channels: [inbox({ title: "{{msg}}" })],
    });
    const notify = createNotifyKit({
      notifications: [def1, def2] as const,
      database: memoryAdapter(),
    });
    await notify.upsertRecipient({ id: "u1" });

    await notify.send({
      recipientId: "u1",
      notificationId: "alert",
      payload: { msg: "hi" },
      idempotencyKey: "shared-key",
    });

    const r1 = await notify.explain({
      recipientId: "u1",
      notificationId: "alert",
      payload: { msg: "hi" },
      idempotencyKey: "shared-key",
    });
    expect(r1.wouldReplayIdempotent).toBe(true);

    const r2 = await notify.explain({
      recipientId: "u1",
      notificationId: "reminder",
      payload: { msg: "hi" },
      idempotencyKey: "shared-key",
    });
    expect(r2.wouldReplayIdempotent).toBe(false);
  });

  test("explain with idempotencyKey does not write any records", async () => {
    const db = memoryAdapter();
    const def = notification({
      id: "alert",
      payload: { msg: "string" },
      channels: [inbox({ title: "{{msg}}" })],
    });
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: db,
    });
    await notify.upsertRecipient({ id: "u1" });

    await notify.explain({
      recipientId: "u1",
      notificationId: "alert",
      payload: { msg: "hi" },
      idempotencyKey: "key-no-write",
    });

    expect(db._state.notifications).toHaveLength(0);
    expect(db._state.deliveries).toHaveLength(0);
    expect(db._state.inboxItems).toHaveLength(0);
  });

  test("disabled channels keep disabled outcome even when idempotent", async () => {
    const def = notification({
      id: "alert",
      payload: { msg: "string" },
      channels: [inbox({ title: "{{msg}}" }), email({ subject: "{{msg}}", body: "{{msg}}" })],
    });
    const provider = fakeEmailProvider();
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: memoryAdapter(),
      providers: { email: provider },
    });
    await notify.upsertRecipient({ id: "u1", email: "u@x.com" });
    await notify.preferences.update({
      recipientId: "u1",
      notificationId: "alert",
      channels: { email: false },
    });

    await notify.send({
      recipientId: "u1",
      notificationId: "alert",
      payload: { msg: "hi" },
      idempotencyKey: "key-disabled",
    });

    const result = await notify.explain({
      recipientId: "u1",
      notificationId: "alert",
      payload: { msg: "hi" },
      idempotencyKey: "key-disabled",
    });
    expect(result.wouldReplayIdempotent).toBe(true);
    const emailCh = result.channels.find((c) => c.channel === "email")!;
    expect(emailCh.outcome).toBe("disabled" as ChannelOutcome);
    const inboxCh = result.channels.find((c) => c.channel === "inbox")!;
    expect(inboxCh.outcome).toBe("idempotent" as ChannelOutcome);
  });

  test("custom TTL is reported in idempotency info", async () => {
    const def = notification({
      id: "alert",
      payload: { msg: "string" },
      channels: [inbox({ title: "{{msg}}" })],
    });
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: memoryAdapter(),
      idempotencyKeyTtlMs: 5000,
    });
    await notify.upsertRecipient({ id: "u1" });

    await notify.send({
      recipientId: "u1",
      notificationId: "alert",
      payload: { msg: "hi" },
      idempotencyKey: "key-ttl",
    });

    const result = await notify.explain({
      recipientId: "u1",
      notificationId: "alert",
      payload: { msg: "hi" },
      idempotencyKey: "key-ttl",
    });
    expect(result.idempotency!.ttlMs).toBe(5000);
  });
});

describe("handler GET /explain", () => {
  function buildHandler() {
    const def = notification({
      id: "comment",
      payload: { msg: "string" },
      channels: [
        inbox({ title: "{{msg}}" }),
        email({ subject: "{{msg}}", body: "{{msg}}" }),
      ],
      category: "social",
      classification: "product",
    });
    const provider = fakeEmailProvider();
    const db = memoryAdapter();
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: db,
      providers: { email: provider },
      defaults: { categories: { social: { email: true } } },
    });
    const handler = createHandler(notify, {
      identify: (req) => {
        const id = req.headers.get("x-user");
        return id ? { recipientId: id } : null;
      },
    });
    return { notify, db, handler };
  }

  test("GET /explain returns delivery explanation", async () => {
    const { notify, handler } = buildHandler();
    await notify.upsertRecipient({ id: "u1", email: "u@x.com" });

    const res = await handler(
      new Request(
        "http://localhost/api/notifykit/explain?notificationId=comment&msg=hi",
        { headers: { "x-user": "u1" } },
      ),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: DeliveryExplanation };
    expect(body.data.notificationId).toBe("comment");
    expect(body.data.wouldRateLimit).toBe(false);
    expect(body.data.wouldDigest).toBe(false);
    expect(body.data.channels.length).toBeGreaterThan(0);
    const emailCh = body.data.channels.find((c) => c.channel === "email");
    expect(emailCh).toBeDefined();
    expect(emailCh!.outcome).toBe("deliver");
  });

  test("GET /explain without notificationId returns 400", async () => {
    const { notify, handler } = buildHandler();
    await notify.upsertRecipient({ id: "u1" });

    const res = await handler(
      new Request("http://localhost/api/notifykit/explain", {
        headers: { "x-user": "u1" },
      }),
    );
    expect(res.status).toBe(400);
  });
});

describe("notify.explain() — payload validation", () => {
  test("valid payload returns valid: true with no field errors", async () => {
    const def = notification({
      id: "welcome",
      payload: { name: "string", count: "number" },
      channels: [inbox({ title: "{{name}}" })],
    });
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: memoryAdapter(),
    });
    await notify.upsertRecipient({ id: "u1" });

    const result = await notify.explain({
      recipientId: "u1",
      notificationId: "welcome",
      payload: { name: "Alice", count: 5 },
    });
    expect(result.payloadValidation.valid).toBe(true);
    expect(result.payloadValidation.fields).toEqual([]);
    expect(result.channels.every((c) => c.outcome === "deliver")).toBe(true);
  });

  test("missing fields returns valid: false with structured field errors", async () => {
    const def = notification({
      id: "alert",
      payload: { title: "string", priority: "number", urgent: "boolean" },
      channels: [inbox({ title: "{{title}}" })],
    });
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: memoryAdapter(),
    });
    await notify.upsertRecipient({ id: "u1" });

    const result = await notify.explain({
      recipientId: "u1",
      notificationId: "alert",
      payload: { title: "fire" },
    });
    expect(result.payloadValidation.valid).toBe(false);
    expect(result.payloadValidation.fields).toHaveLength(2);
    const keys = result.payloadValidation.fields.map((f) => f.key);
    expect(keys).toContain("priority");
    expect(keys).toContain("urgent");
    const priorityField = result.payloadValidation.fields.find((f) => f.key === "priority")!;
    expect(priorityField.expected).toBe("number");
    expect(priorityField.actual).toBe("undefined");
  });

  test("wrong types returns valid: false with type mismatch details", async () => {
    const def = notification({
      id: "metric",
      payload: { value: "number", label: "string" },
      channels: [inbox({ title: "{{label}}" })],
    });
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: memoryAdapter(),
    });
    await notify.upsertRecipient({ id: "u1" });

    const result = await notify.explain({
      recipientId: "u1",
      notificationId: "metric",
      payload: { value: "not-a-number", label: 42 },
    });
    expect(result.payloadValidation.valid).toBe(false);
    expect(result.payloadValidation.fields).toHaveLength(2);
    const valueField = result.payloadValidation.fields.find((f) => f.key === "value")!;
    expect(valueField.expected).toBe("number");
    expect(valueField.actual).toBe("string");
    const labelField = result.payloadValidation.fields.find((f) => f.key === "label")!;
    expect(labelField.expected).toBe("string");
    expect(labelField.actual).toBe("number");
  });

  test("invalid payload produces invalid_payload channel outcome", async () => {
    const def = notification({
      id: "invite",
      payload: { email: "string" },
      channels: [
        inbox({ title: "invite" }),
        email({ subject: "invite", body: "{{email}}" }),
      ],
    });
    const provider = fakeEmailProvider();
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: memoryAdapter(),
      providers: { email: provider },
    });
    await notify.upsertRecipient({ id: "u1", email: "u@x.com" });

    const result = await notify.explain({
      recipientId: "u1",
      notificationId: "invite",
      payload: { email: 123 },
    });
    expect(result.payloadValidation.valid).toBe(false);
    expect(
      result.channels
        .filter((c) => c.allowed)
        .every((c) => c.outcome === ("invalid_payload" as ChannelOutcome)),
    ).toBe(true);
  });

  test("non-object payload returns root-level field error", async () => {
    const def = notification({
      id: "ping",
      payload: { msg: "string" },
      channels: [inbox({ title: "{{msg}}" })],
    });
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: memoryAdapter(),
    });
    await notify.upsertRecipient({ id: "u1" });

    const result = await notify.explain({
      recipientId: "u1",
      notificationId: "ping",
      payload: "not-an-object" as unknown as { msg: string },
    });
    expect(result.payloadValidation.valid).toBe(false);
    expect(result.payloadValidation.fields).toHaveLength(1);
    expect(result.payloadValidation.fields[0]!.key).toBe("(root)");
    expect(result.payloadValidation.fields[0]!.expected).toBe("object");
    expect(result.payloadValidation.fields[0]!.actual).toBe("string");
  });

  test("custom validate function — valid payload", async () => {
    const def = notification({
      id: "custom-ok",
      payload: { x: "string" },
      channels: [inbox({ title: "{{x}}" })],
      validate: (p: unknown) => {
        const data = p as { x: string };
        if (typeof data.x !== "string") throw new Error("x must be string");
        return data;
      },
    });
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: memoryAdapter(),
    });
    await notify.upsertRecipient({ id: "u1" });

    const result = await notify.explain({
      recipientId: "u1",
      notificationId: "custom-ok",
      payload: { x: "hello" },
    });
    expect(result.payloadValidation.valid).toBe(true);
    expect(result.payloadValidation.fields).toEqual([]);
  });

  test("custom validate function — throws error", async () => {
    const def = notification({
      id: "custom-fail",
      payload: { x: "string" },
      channels: [inbox({ title: "{{x}}" })],
      validate: (_p: unknown) => {
        throw new Error("x is required and must be non-empty");
      },
    });
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: memoryAdapter(),
    });
    await notify.upsertRecipient({ id: "u1" });

    const result = await notify.explain({
      recipientId: "u1",
      notificationId: "custom-fail",
      payload: {},
    });
    expect(result.payloadValidation.valid).toBe(false);
    expect(result.payloadValidation.fields).toHaveLength(1);
    expect(result.payloadValidation.fields[0]!.message).toBe(
      "x is required and must be non-empty",
    );
    expect(
      result.channels
        .filter((c) => c.allowed)
        .every((c) => c.outcome === ("invalid_payload" as ChannelOutcome)),
    ).toBe(true);
  });

  test("custom validate with structured field errors preserves them", async () => {
    const def = notification({
      id: "custom-fields",
      payload: { a: "string", b: "number" },
      channels: [inbox({ title: "{{a}}" })],
      validate: (_p: unknown) => {
        const err = new Error("Validation failed") as Error & {
          fields: Array<{ key: string; expected: string; actual: string; message: string }>;
        };
        err.fields = [
          { key: "a", expected: "string", actual: "undefined", message: "a is required" },
          { key: "b", expected: "number", actual: "string", message: "b must be a number" },
        ];
        throw err;
      },
    });
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: memoryAdapter(),
    });
    await notify.upsertRecipient({ id: "u1" });

    const result = await notify.explain({
      recipientId: "u1",
      notificationId: "custom-fields",
      payload: {},
    });
    expect(result.payloadValidation.valid).toBe(false);
    expect(result.payloadValidation.fields).toHaveLength(2);
    expect(result.payloadValidation.fields[0]!.key).toBe("a");
    expect(result.payloadValidation.fields[1]!.key).toBe("b");
  });

  test("invalid payload does not write any records", async () => {
    const db = memoryAdapter();
    const def = notification({
      id: "no-write",
      payload: { x: "string" },
      channels: [inbox({ title: "{{x}}" })],
    });
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: db,
    });
    await notify.upsertRecipient({ id: "u1" });

    await notify.explain({
      recipientId: "u1",
      notificationId: "no-write",
      payload: { x: 999 },
    });

    expect(db._state.notifications).toHaveLength(0);
    expect(db._state.deliveries).toHaveLength(0);
    expect(db._state.inboxItems).toHaveLength(0);
  });

  test("disabled channels keep disabled outcome even with invalid payload", async () => {
    const def = notification({
      id: "disabled-test",
      payload: { msg: "string" },
      channels: [
        inbox({ title: "{{msg}}" }),
        email({ subject: "{{msg}}", body: "{{msg}}" }),
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
    await notify.preferences.update({
      recipientId: "u1",
      notificationId: "disabled-test",
      channels: { email: false },
    });

    const result = await notify.explain({
      recipientId: "u1",
      notificationId: "disabled-test",
      payload: { msg: 42 },
    });
    expect(result.payloadValidation.valid).toBe(false);
    const emailCh = result.channels.find((c) => c.channel === "email")!;
    expect(emailCh.outcome).toBe("disabled" as ChannelOutcome);
    const inboxCh = result.channels.find((c) => c.channel === "inbox")!;
    expect(inboxCh.outcome).toBe("invalid_payload" as ChannelOutcome);
  });

  test("NaN number field reports invalid", async () => {
    const def = notification({
      id: "nan-test",
      payload: { score: "number" },
      channels: [inbox({ title: "score" })],
    });
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: memoryAdapter(),
    });
    await notify.upsertRecipient({ id: "u1" });

    const result = await notify.explain({
      recipientId: "u1",
      notificationId: "nan-test",
      payload: { score: NaN },
    });
    expect(result.payloadValidation.valid).toBe(false);
    expect(result.payloadValidation.fields).toHaveLength(1);
    expect(result.payloadValidation.fields[0]!.key).toBe("score");
    expect(result.payloadValidation.fields[0]!.expected).toBe("number");
    expect(result.payloadValidation.fields[0]!.actual).toBe("NaN");
  });
});

describe("notify.check() alias", () => {
  test("check() returns same result as explain()", async () => {
    const def = notification({
      id: "alert",
      payload: { msg: "string" },
      channels: [inbox({ title: "{{msg}}" }), email({ subject: "{{msg}}", body: "{{msg}}" })],
    });
    const provider = fakeEmailProvider();
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: memoryAdapter(),
      providers: { email: provider },
    });
    await notify.upsertRecipient({ id: "u1", email: "u@x.com" });

    const explainResult = await notify.explain({
      recipientId: "u1",
      notificationId: "alert",
      payload: { msg: "hi" },
    });
    const checkResult = await notify.check({
      recipientId: "u1",
      notificationId: "alert",
      payload: { msg: "hi" },
    });

    expect(checkResult.recipientId).toBe(explainResult.recipientId);
    expect(checkResult.notificationId).toBe(explainResult.notificationId);
    expect(checkResult.wouldRateLimit).toBe(explainResult.wouldRateLimit);
    expect(checkResult.wouldDeduplicate).toBe(explainResult.wouldDeduplicate);
    expect(checkResult.wouldDigest).toBe(explainResult.wouldDigest);
    expect(checkResult.wouldReplayIdempotent).toBe(explainResult.wouldReplayIdempotent);
    expect(checkResult.channels.length).toBe(explainResult.channels.length);
  });

  test("check() does not write any records", async () => {
    const db = memoryAdapter();
    const def = notification({
      id: "alert",
      payload: { msg: "string" },
      channels: [inbox({ title: "{{msg}}" }), email({ subject: "{{msg}}", body: "{{msg}}" })],
    });
    const provider = fakeEmailProvider();
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: db,
      providers: { email: provider },
    });
    await notify.upsertRecipient({ id: "u1", email: "u@x.com" });

    await notify.check({
      recipientId: "u1",
      notificationId: "alert",
      payload: { msg: "hi" },
    });

    expect(db._state.notifications).toHaveLength(0);
    expect(db._state.deliveries).toHaveLength(0);
    expect(db._state.inboxItems).toHaveLength(0);
    expect(provider.sent).toHaveLength(0);
  });
});

describe("notify.send({ dryRun: true })", () => {
  test("dryRun returns DeliveryExplanation instead of SendResult", async () => {
    const def = notification({
      id: "alert",
      payload: { msg: "string" },
      channels: [inbox({ title: "{{msg}}" }), email({ subject: "{{msg}}", body: "{{msg}}" })],
    });
    const provider = fakeEmailProvider();
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: memoryAdapter(),
      providers: { email: provider },
    });
    await notify.upsertRecipient({ id: "u1", email: "u@x.com" });

    const result = await notify.send({
      recipientId: "u1",
      notificationId: "alert",
      payload: { msg: "hi" },
      dryRun: true,
    });

    expect(result.recipientId).toBe("u1");
    expect(result.notificationId).toBe("alert");
    expect(result.channels.length).toBeGreaterThan(0);
    expect(result.wouldRateLimit).toBe(false);
    expect(result.wouldDeduplicate).toBe(false);
    expect(result.payloadValidation.valid).toBe(true);
  });

  test("dryRun does not create notification records", async () => {
    const db = memoryAdapter();
    const def = notification({
      id: "alert",
      payload: { msg: "string" },
      channels: [inbox({ title: "{{msg}}" }), email({ subject: "{{msg}}", body: "{{msg}}" })],
    });
    const provider = fakeEmailProvider();
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: db,
      providers: { email: provider },
    });
    await notify.upsertRecipient({ id: "u1", email: "u@x.com" });

    await notify.send({
      recipientId: "u1",
      notificationId: "alert",
      payload: { msg: "hi" },
      dryRun: true,
    });

    expect(db._state.notifications).toHaveLength(0);
    expect(db._state.deliveries).toHaveLength(0);
    expect(db._state.inboxItems).toHaveLength(0);
    expect(provider.sent).toHaveLength(0);
  });

  test("dryRun does not create inbox items", async () => {
    const db = memoryAdapter();
    const def = notification({
      id: "alert",
      payload: { msg: "string" },
      channels: [inbox({ title: "{{msg}}" })],
    });
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: db,
    });
    await notify.upsertRecipient({ id: "u1" });

    await notify.send({
      recipientId: "u1",
      notificationId: "alert",
      payload: { msg: "hi" },
      dryRun: true,
    });

    expect(db._state.inboxItems).toHaveLength(0);
  });

  test("dryRun does not consume rate limit budget", async () => {
    const db = memoryAdapter();
    const def = notification({
      id: "limited",
      payload: { msg: "string" },
      channels: [inbox({ title: "{{msg}}" })],
      rateLimit: { max: 1, windowMs: 60_000 },
    });
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: db,
    });
    await notify.upsertRecipient({ id: "u1" });

    await notify.send({
      recipientId: "u1",
      notificationId: "limited",
      payload: { msg: "hi" },
      dryRun: true,
    });

    const real = await notify.send({
      recipientId: "u1",
      notificationId: "limited",
      payload: { msg: "hi" },
    });
    expect(real.rateLimited).toBe(false);
  });

  test("dryRun does not insert dedupe keys", async () => {
    const db = memoryAdapter();
    const def = notification({
      id: "mention",
      payload: { msg: "string" },
      channels: [inbox({ title: "{{msg}}" })],
    });
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: db,
    });
    await notify.upsertRecipient({ id: "u1" });

    await notify.send({
      recipientId: "u1",
      notificationId: "mention",
      payload: { msg: "hi" },
      dedupeKey: "dup-1",
      dedupeWindowMs: 60_000,
      dryRun: true,
    });

    const real = await notify.send({
      recipientId: "u1",
      notificationId: "mention",
      payload: { msg: "hi" },
      dedupeKey: "dup-1",
      dedupeWindowMs: 60_000,
    });
    expect(real.skipped).toHaveLength(0);
  });

  test("dryRun does not buffer digests", async () => {
    const db = memoryAdapter();
    const def = notification({
      id: "digest-test",
      payload: { msg: "string" },
      channels: [inbox({ title: "{{msg}}" })],
      digest: {
        windowMs: 60_000,
        render: ({ payloads, count }) => ({ msg: `${count} items` }),
      },
    });
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: db,
    });
    await notify.upsertRecipient({ id: "u1" });

    await notify.send({
      recipientId: "u1",
      notificationId: "digest-test",
      payload: { msg: "hi" },
      dryRun: true,
    });

    const buffers = await db.digests.list();
    expect(buffers).toHaveLength(0);
  });

  test("dryRun does not create scheduled sends for quiet hours", async () => {
    const db = memoryAdapter();
    const def = notification({
      id: "alert",
      payload: { msg: "string" },
      channels: [email({ subject: "{{msg}}", body: "{{msg}}" })],
    });
    const provider = fakeEmailProvider();
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: db,
      providers: { email: provider },
    });
    await notify.upsertRecipient({
      id: "u1",
      email: "u@x.com",
      quietHours: { start: "00:00", end: "23:59", timezone: "UTC" },
    });

    await notify.send({
      recipientId: "u1",
      notificationId: "alert",
      payload: { msg: "hi" },
      dryRun: true,
    });

    const scheduled = await db.scheduledSends.list();
    expect(scheduled).toHaveLength(0);
  });

  test("dryRun: false behaves like normal send", async () => {
    const db = memoryAdapter();
    const def = notification({
      id: "alert",
      payload: { msg: "string" },
      channels: [inbox({ title: "{{msg}}" })],
    });
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: db,
    });
    await notify.upsertRecipient({ id: "u1" });

    const result = await notify.send({
      recipientId: "u1",
      notificationId: "alert",
      payload: { msg: "hi" },
      dryRun: false,
    });

    expect(result.notification).not.toBeNull();
    expect(db._state.notifications).toHaveLength(1);
  });
});
