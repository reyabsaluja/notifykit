import { describe, expect, test } from "bun:test";
import {
  channel,
  createNotifyKit,
  memoryAdapter,
  notification,
} from "../src/index.js";

const inbox = channel.inbox();
const email = channel.email();

const alwaysFail = {
  id: "always-fail",
  async send() {
    throw new Error("simulated provider failure");
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

  test("fires for each failed email when multiple would-be deliveries are configured", async () => {
    // If the same notification had two email channels (unusual today — one
    // for primary, one for say a BCC), each failure should trigger its own
    // fallback. We prove the "no coalescing" behavior.
    const def = notification({
      id: "double",
      payload: { msg: "string" },
      channels: [
        email({ subject: "A", body: "{{msg}}" }),
        email({ subject: "B", body: "{{msg}}" }),
      ],
      fallback: inbox({ title: "Fallback: {{msg}}" }),
    });
    const db = memoryAdapter();
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: db,
      providers: { email: alwaysFail },
      retry: { maxAttempts: 1, delayMs: () => 0 },
    });
    await notify.upsertRecipient({ id: "u1", email: "u@x.com" });
    await notify.send({
      recipientId: "u1",
      notificationId: "double",
      payload: { msg: "hi" },
    });
    const items = await notify.inbox.list("u1");
    expect(items).toHaveLength(2);
    for (const item of items) {
      expect(item.title).toBe("Fallback: hi");
    }
  });
});
