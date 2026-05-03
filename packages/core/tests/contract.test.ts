import { describe, expect, test, spyOn } from "bun:test";
import {
  channel,
  createNotifyKit,
  fakeEmailProvider,
  fakeWebhookProvider,
  memoryAdapter,
  notification,
  redactPayload,
} from "../src/index.js";

const inbox = channel.inbox();
const email = channel.email();
const webhook = channel.webhook();

describe("definition metadata", () => {
  test("notification() accepts description, category, version, redact", () => {
    const def = notification({
      id: "password_changed",
      payload: { email: "string", ip: "string" },
      channels: [inbox({ title: "Password changed from {{ip}}" })],
      description: "Sent when a user changes their password.",
      category: "security",
      version: 2,
      redact: ["email", "ip"],
    });
    expect(def.id).toBe("password_changed");
    expect(def.description).toBe("Sent when a user changes their password.");
    expect(def.category).toBe("security");
    expect(def.version).toBe(2);
    expect(def.redact).toEqual(["email", "ip"]);
  });

  test("notification definitions index includes metadata via handler", async () => {
    const { createHandler } = await import("../src/index.js");
    const def = notification({
      id: "inv_created",
      payload: { amount: "string" },
      channels: [inbox({ title: "Invoice {{amount}}" })],
      description: "New invoice",
      category: "billing",
      version: 3,
    });
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: memoryAdapter(),
    });
    const handler = createHandler(notify, { identify: () => null });
    const res = await handler(
      new Request("http://localhost/api/notifykit/notifications"),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: Array<{
        id: string;
        description?: string;
        category?: string;
        version?: number;
      }>;
    };
    expect(body.data[0]!.description).toBe("New invoice");
    expect(body.data[0]!.category).toBe("billing");
    expect(body.data[0]!.version).toBe(3);
  });
});

describe("definition snapshots on notification records", () => {
  test("notification record stores payloadSchema and definitionVersion", async () => {
    const db = memoryAdapter();
    const def = notification({
      id: "test_snap",
      payload: { name: "string", count: "number" },
      channels: [inbox({ title: "{{name}}" })],
      version: 5,
    });
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: db,
    });
    await notify.upsertRecipient({ id: "u1" });
    const result = await notify.send({
      recipientId: "u1",
      notificationId: "test_snap",
      payload: { name: "hi", count: 42 },
    });
    expect(result.notification).not.toBeNull();
    expect(result.notification!.payloadSchema).toEqual({
      name: "string",
      count: "number",
    });
    expect(result.notification!.definitionVersion).toBe(5);
  });

  test("default version is undefined when not set", async () => {
    const db = memoryAdapter();
    const def = notification({
      id: "no_version",
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
      notificationId: "no_version",
      payload: { msg: "hi" },
    });
    expect(result.notification!.definitionVersion).toBeUndefined();
    expect(result.notification!.payloadSchema).toEqual({ msg: "string" });
  });
});

describe("payload redaction", () => {
  test("redactPayload replaces listed fields with [REDACTED]", () => {
    const payload = { name: "Alice", ssn: "123-45-6789", age: 30 };
    const result = redactPayload(payload, ["ssn"]);
    expect(result).toEqual({ name: "Alice", ssn: "[REDACTED]", age: 30 });
    expect(payload.ssn).toBe("123-45-6789");
  });

  test("redactPayload with empty list returns payload as-is", () => {
    const payload = { name: "Alice" };
    const result = redactPayload(payload, []);
    expect(result).toBe(payload);
  });

  test("redactPayload ignores fields not in payload", () => {
    const payload = { name: "Alice" };
    const result = redactPayload(payload, ["ssn"]);
    expect(result).toEqual({ name: "Alice" });
  });

  test("notifyKit.redactPayload uses definition redact list", () => {
    const def = notification({
      id: "user_created",
      payload: { email: "string", name: "string" },
      channels: [inbox({ title: "Welcome {{name}}" })],
      redact: ["email"],
    });
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: memoryAdapter(),
    });
    const result = notify.redactPayload("user_created", {
      email: "alice@x.com",
      name: "Alice",
    });
    expect(result).toEqual({ email: "[REDACTED]", name: "Alice" });
  });

  test("redactPayload returns payload as-is when no redact configured", () => {
    const def = notification({
      id: "plain",
      payload: { msg: "string" },
      channels: [inbox({ title: "{{msg}}" })],
    });
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: memoryAdapter(),
    });
    const payload = { msg: "hi" };
    const result = notify.redactPayload("plain", payload);
    expect(result).toBe(payload);
  });

  test("redactPayload for unknown notification throws", () => {
    const def = notification({
      id: "known",
      payload: { msg: "string" },
      channels: [inbox({ title: "{{msg}}" })],
    });
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: memoryAdapter(),
    });
    const payload = { msg: "hi" };
    expect(() => notify.redactPayload("unknown_id", payload)).toThrow(
      /Unknown notification id/,
    );
  });

  test("hooks receive redactedPayload with sensitive fields masked", async () => {
    const db = memoryAdapter();
    const captured: {
      createdPayload?: Record<string, unknown>;
      sentPayload?: Record<string, unknown>;
    } = {};
    const def = notification({
      id: "pw_change",
      payload: { email: "string", ip: "string" },
      channels: [
        channel.email()({ subject: "Changed", body: "From {{ip}}" }),
      ],
      redact: ["email"],
    });
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: db,
      providers: { email: fakeEmailProvider() },
      on: {
        "notification.created": ({ redactedPayload }) => {
          captured.createdPayload = redactedPayload;
        },
        "delivery.sent": ({ redactedPayload }) => {
          captured.sentPayload = redactedPayload;
        },
      },
    });
    await notify.upsertRecipient({ id: "u1", email: "u@x.com" });
    await notify.send({
      recipientId: "u1",
      notificationId: "pw_change",
      payload: { email: "secret@x.com", ip: "1.2.3.4" },
    });
    expect(captured.createdPayload).toEqual({
      email: "[REDACTED]",
      ip: "1.2.3.4",
    });
    expect(captured.sentPayload).toEqual({
      email: "[REDACTED]",
      ip: "1.2.3.4",
    });
  });
});

test("redact rejects fields not in payload schema at compile time", () => {
  notification({
    id: "type_test",
    payload: { name: "string", count: "number" },
    channels: [inbox({ title: "{{name}}" })],
    // @ts-expect-error — "bad_field" is not a key of the payload schema
    redact: ["bad_field"],
  });

  notification({
    id: "type_test_ok",
    payload: { name: "string", secret: "string" },
    channels: [inbox({ title: "{{name}}" })],
    redact: ["secret"], // valid — should not error
  });
});

describe("startup validation", () => {
  test("rejects duplicate notification IDs", () => {
    expect(() =>
      createNotifyKit({
        notifications: [
          notification({
            id: "dup",
            payload: { msg: "string" },
            channels: [inbox({ title: "{{msg}}" })],
          }),
          notification({
            id: "dup",
            payload: { msg: "string" },
            channels: [inbox({ title: "{{msg}}" })],
          }),
        ] as const,
        database: memoryAdapter(),
      }),
    ).toThrow(/duplicate notification id.*dup/i);
  });

  test("rejects notification with no channels", () => {
    expect(() =>
      createNotifyKit({
        notifications: [
          notification({
            id: "empty",
            payload: { msg: "string" },
            channels: [],
          }),
        ] as const,
        database: memoryAdapter(),
      }),
    ).toThrow(/no channels/i);
  });

  test("rejects email channel without email provider at startup", () => {
    expect(() =>
      createNotifyKit({
        notifications: [
          notification({
            id: "needs_email",
            payload: { msg: "string" },
            channels: [email({ subject: "{{msg}}", body: "{{msg}}" })],
          }),
        ] as const,
        database: memoryAdapter(),
      }),
    ).toThrow(/no email provider/i);
  });

  test("rejects webhook channel without webhook provider at startup", () => {
    expect(() =>
      createNotifyKit({
        notifications: [
          notification({
            id: "needs_webhook",
            payload: { url: "string" },
            channels: [webhook({ url: "https://hook.example" })],
          }),
        ] as const,
        database: memoryAdapter(),
      }),
    ).toThrow(/no webhook provider/i);
  });

  test("rejects template variable not in payload schema", () => {
    expect(() =>
      createNotifyKit({
        notifications: [
          notification({
            id: "bad_tmpl",
            payload: { name: "string" },
            channels: [inbox({ title: "Hello {{typo}}" })],
          }),
        ] as const,
        database: memoryAdapter(),
      }),
    ).toThrow(/typo.*payload schema/i);
  });

  test("allows {{_unsubscribeUrl}} without it being in the payload schema", () => {
    expect(() =>
      createNotifyKit({
        notifications: [
          notification({
            id: "with_unsub",
            payload: { name: "string" },
            channels: [
              email({
                subject: "Hi {{name}}",
                body: "Unsub: {{_unsubscribeUrl}}",
              }),
            ],
          }),
        ] as const,
        database: memoryAdapter(),
        providers: { email: fakeEmailProvider() },
        unsubscribe: { secret: "s", baseUrl: "http://x" },
      }),
    ).not.toThrow();
  });

  test("rejects redact field not in payload schema", () => {
    expect(() =>
      createNotifyKit({
        notifications: [
          notification({
            id: "bad_redact",
            payload: { name: "string" },
            channels: [inbox({ title: "{{name}}" })],
            redact: ["nonexistent" as "name"],
          }),
        ] as const,
        database: memoryAdapter(),
      }),
    ).toThrow(/redact.*nonexistent/i);
  });

  test("rejects non-positive-integer version", () => {
    expect(() =>
      createNotifyKit({
        notifications: [
          notification({
            id: "bad_ver",
            payload: { msg: "string" },
            channels: [inbox({ title: "{{msg}}" })],
            version: 0,
          }),
        ] as const,
        database: memoryAdapter(),
      }),
    ).toThrow(/version.*positive integer/i);

    expect(() =>
      createNotifyKit({
        notifications: [
          notification({
            id: "bad_ver2",
            payload: { msg: "string" },
            channels: [inbox({ title: "{{msg}}" })],
            version: 1.5,
          }),
        ] as const,
        database: memoryAdapter(),
      }),
    ).toThrow(/version.*positive integer/i);
  });

  test("validates fallback template variables too", () => {
    expect(() =>
      createNotifyKit({
        notifications: [
          notification({
            id: "bad_fallback",
            payload: { msg: "string" },
            channels: [
              email({ subject: "{{msg}}", body: "{{msg}}" }),
            ],
            fallback: inbox({ title: "Fallback: {{oops}}" }),
          }),
        ] as const,
        database: memoryAdapter(),
        providers: { email: fakeEmailProvider() },
      }),
    ).toThrow(/oops.*payload schema/i);
  });

  test("passes with valid config", () => {
    expect(() =>
      createNotifyKit({
        notifications: [
          notification({
            id: "valid",
            payload: { name: "string", count: "number" },
            channels: [
              inbox({ title: "{{name}} ({{count}})" }),
              email({
                subject: "Hi {{name}}",
                body: "You have {{count}} items.",
              }),
            ],
            description: "A valid notification",
            category: "general",
            version: 1,
          }),
        ] as const,
        database: memoryAdapter(),
        providers: { email: fakeEmailProvider() },
      }),
    ).not.toThrow();
  });
});

describe("custom validate function", () => {
  test("custom validate replaces built-in schema validation", async () => {
    let validateCalled = false;
    const def = notification({
      id: "custom_val",
      payload: { msg: "string" },
      channels: [inbox({ title: "{{msg}}" })],
      validate: (payload) => {
        validateCalled = true;
        const p = payload as { msg: unknown };
        if (typeof p.msg !== "string") throw new Error("msg must be string");
        return { msg: String(p.msg).toUpperCase() };
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
      notificationId: "custom_val",
      payload: { msg: "hello" },
    });
    expect(validateCalled).toBe(true);
    expect(result.notification!.payload).toEqual({ msg: "HELLO" });
    expect(result.inboxItems[0]!.title).toBe("HELLO");
  });

  test("custom validate throwing rejects the send", async () => {
    const def = notification({
      id: "bad_val",
      payload: { msg: "string" },
      channels: [inbox({ title: "{{msg}}" })],
      validate: () => {
        throw new Error("Custom validation failed");
      },
    });
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: memoryAdapter(),
    });
    await notify.upsertRecipient({ id: "u1" });
    await expect(
      notify.send({
        recipientId: "u1",
        notificationId: "bad_val",
        payload: { msg: "anything" },
      }),
    ).rejects.toThrow("Custom validation failed");
  });

  test("custom validate runs during digest flush", async () => {
    let validateCount = 0;
    const def = notification({
      id: "digest_val",
      payload: { msg: "string" },
      channels: [inbox({ title: "{{msg}}" })],
      digest: {
        windowMs: 60_000,
        render: ({ payloads }) => ({
          msg: payloads.map((p) => p.msg).join(", "),
        }),
      },
      validate: (payload) => {
        validateCount++;
        const p = payload as { msg: unknown };
        if (typeof p.msg !== "string") throw new Error("msg must be string");
        return { msg: String(p.msg).toUpperCase() };
      },
    });
    const db = memoryAdapter();
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: db,
    });
    await notify.upsertRecipient({ id: "u1" });

    await notify.send({
      recipientId: "u1",
      notificationId: "digest_val",
      payload: { msg: "hello" },
    });
    await notify.send({
      recipientId: "u1",
      notificationId: "digest_val",
      payload: { msg: "world" },
    });

    const preFlushCount = validateCount;
    await notify.flushDigests();

    expect(validateCount).toBeGreaterThan(preFlushCount);
    expect(db._state.inboxItems).toHaveLength(1);
    expect(db._state.inboxItems[0]!.title).toBe("HELLO, WORLD");
  });

  test("custom validate runs only at send time, not again during scheduled-send flush", async () => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const start = `${pad((now.getUTCHours() + 23) % 24)}:${pad(now.getUTCMinutes())}`;
    const end = `${pad((now.getUTCHours() + 1) % 24)}:${pad(now.getUTCMinutes())}`;

    let validateCount = 0;
    const def = notification({
      id: "quiet_val",
      payload: { msg: "string" },
      channels: [
        inbox({ title: "{{msg}}" }),
        email({ subject: "{{msg}}", body: "{{msg}}" }),
      ],
      validate: (payload) => {
        validateCount++;
        const p = payload as { msg: unknown };
        if (typeof p.msg !== "string") throw new Error("msg must be string");
        return { msg: String(p.msg).toUpperCase() };
      },
    });
    const provider = fakeEmailProvider();
    const db = memoryAdapter();
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: db,
      providers: { email: provider },
    });
    await notify.upsertRecipient({
      id: "u1",
      email: "u@x.com",
      quietHours: { start, end, timezone: "UTC" },
    });

    await notify.send({
      recipientId: "u1",
      notificationId: "quiet_val",
      payload: { msg: "hello" },
    });

    expect(db._state.scheduledSends).toHaveLength(1);
    const preFlushCount = validateCount;

    await notify.flushScheduledSends();

    // Custom validate must NOT be called again — the payload was already
    // transformed at send() time. Re-running a non-idempotent transform
    // would corrupt the data.
    expect(validateCount).toBe(preFlushCount);
    expect(provider.sent).toHaveLength(1);
    expect(provider.sent[0]!.subject).toBe("HELLO");
  });
});

describe("startup validation — webhook header templates", () => {
  test("rejects template variable in webhook headers not in payload schema", () => {
    expect(() =>
      createNotifyKit({
        notifications: [
          notification({
            id: "bad_header",
            payload: { name: "string" },
            channels: [
              webhook({
                url: "https://hook.example",
                headers: { "x-key": "{{typo}}" },
              }),
            ],
          }),
        ] as const,
        database: memoryAdapter(),
        providers: { webhook: fakeWebhookProvider() },
      }),
    ).toThrow(/typo.*payload schema/i);
  });

  test("passes when webhook header variables exist in schema", () => {
    expect(() =>
      createNotifyKit({
        notifications: [
          notification({
            id: "good_header",
            payload: { name: "string" },
            channels: [
              webhook({
                url: "https://hook.example",
                headers: { "x-name": "{{name}}" },
              }),
            ],
          }),
        ] as const,
        database: memoryAdapter(),
        providers: { webhook: fakeWebhookProvider() },
      }),
    ).not.toThrow();
  });
});

describe("zodPayload adapter", () => {
  test("derives PayloadSchema and validate from a Zod object schema", async () => {
    const { z } = await import("zod");
    const { zodPayload } = await import("../src/zod.js");

    const { payload, validate } = zodPayload(
      z.object({ name: z.string(), count: z.number() }),
    );
    expect(payload).toEqual({ name: "string", count: "number" });
    expect(validate({ name: "Alice", count: 5 })).toEqual({
      name: "Alice",
      count: 5,
    });
  });

  test("validate throws on invalid input", async () => {
    const { z } = await import("zod");
    const { zodPayload } = await import("../src/zod.js");

    const { validate } = zodPayload(
      z.object({ name: z.string() }),
    );
    expect(() => validate({ name: 123 })).toThrow();
  });

  test("works end-to-end with notification() and createNotifyKit()", async () => {
    const { z } = await import("zod");
    const { zodPayload } = await import("../src/zod.js");

    const { payload, validate } = zodPayload(
      z.object({ name: z.string(), amount: z.number() }),
    );
    const def = notification({
      id: "zod_test",
      payload,
      validate,
      channels: [inbox({ title: "Hi {{name}}, ${{amount}}" })],
    });
    const db = memoryAdapter();
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: db,
    });
    await notify.upsertRecipient({ id: "u1" });
    const result = await notify.send({
      recipientId: "u1",
      notificationId: "zod_test",
      payload: { name: "Alice", amount: 42 },
    });
    expect(result.notification!.payload).toEqual({ name: "Alice", amount: 42 });
    expect(result.inboxItems[0]!.title).toBe("Hi Alice, $42");
  });

  test("Zod validation rejects bad payload at send time", async () => {
    const { z } = await import("zod");
    const { zodPayload } = await import("../src/zod.js");

    const { payload, validate } = zodPayload(
      z.object({ name: z.string() }),
    );
    const def = notification({
      id: "zod_reject",
      payload,
      validate,
      channels: [inbox({ title: "{{name}}" })],
    });
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: memoryAdapter(),
    });
    await notify.upsertRecipient({ id: "u1" });
    await expect(
      notify.send({
        recipientId: "u1",
        notificationId: "zod_reject",
        payload: { name: 999 as unknown as string },
      }),
    ).rejects.toThrow();
  });

  test("boolean fields are included in inferred schema", async () => {
    const { z } = await import("zod");
    const { zodPayload } = await import("../src/zod.js");

    const { payload } = zodPayload(
      z.object({ active: z.boolean(), name: z.string() }),
    );
    expect(payload).toEqual({ active: "boolean", name: "string" });
  });

  test("non-primitive Zod fields are omitted from PayloadSchema and warn", async () => {
    const { z } = await import("zod");
    const { zodPayload } = await import("../src/zod.js");

    const warnSpy = spyOn(console, "warn").mockImplementation(() => {});
    const { payload, validate } = zodPayload(
      z.object({
        name: z.string(),
        tags: z.array(z.string()),
      }),
    );
    expect(payload).toEqual({ name: "string" });
    expect(validate({ name: "Alice", tags: ["a", "b"] })).toEqual({
      name: "Alice",
      tags: ["a", "b"],
    });
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]![0]).toMatch(/tags.*not mapped/i);
    warnSpy.mockRestore();
  });
});

describe("valibotPayload adapter", () => {
  test("derives PayloadSchema and validate from a Valibot object schema", async () => {
    const v = await import("valibot");
    const { valibotPayload } = await import("../src/valibot.js");

    const { payload, validate } = valibotPayload(
      v.object({ name: v.string(), count: v.number() }),
      (schema, data) => v.parse(schema, data) as Record<string, unknown>,
    );
    expect(payload).toEqual({ name: "string", count: "number" });
    expect(validate({ name: "Alice", count: 5 })).toEqual({
      name: "Alice",
      count: 5,
    });
  });

  test("validate throws on invalid input", async () => {
    const v = await import("valibot");
    const { valibotPayload } = await import("../src/valibot.js");

    const { validate } = valibotPayload(
      v.object({ name: v.string() }),
      (schema, data) => v.parse(schema, data) as Record<string, unknown>,
    );
    expect(() => validate({ name: 123 })).toThrow();
  });

  test("boolean fields are included in inferred schema", async () => {
    const v = await import("valibot");
    const { valibotPayload } = await import("../src/valibot.js");

    const { payload } = valibotPayload(
      v.object({ active: v.boolean(), name: v.string() }),
      (schema, data) => v.parse(schema, data) as Record<string, unknown>,
    );
    expect(payload).toEqual({ active: "boolean", name: "string" });
  });

  test("non-primitive fields are omitted and warn", async () => {
    const v = await import("valibot");
    const { valibotPayload } = await import("../src/valibot.js");

    const warnSpy = spyOn(console, "warn").mockImplementation(() => {});
    const { payload } = valibotPayload(
      v.object({ name: v.string(), tags: v.array(v.string()) }),
      (schema, data) => v.parse(schema, data) as Record<string, unknown>,
    );
    expect(payload).toEqual({ name: "string" });
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]![0]).toMatch(/tags.*not mapped/i);
    warnSpy.mockRestore();
  });

  test("works end-to-end with notification() and createNotifyKit()", async () => {
    const v = await import("valibot");
    const { valibotPayload } = await import("../src/valibot.js");

    const { payload, validate } = valibotPayload(
      v.object({ name: v.string(), amount: v.number() }),
      (schema, data) => v.parse(schema, data) as Record<string, unknown>,
    );
    const def = notification({
      id: "valibot_test",
      payload,
      validate,
      channels: [inbox({ title: "Hi {{name}}, ${{amount}}" })],
    });
    const db = memoryAdapter();
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: db,
    });
    await notify.upsertRecipient({ id: "u1" });
    const result = await notify.send({
      recipientId: "u1",
      notificationId: "valibot_test",
      payload: { name: "Alice", amount: 42 },
    });
    expect(result.notification!.payload).toEqual({ name: "Alice", amount: 42 });
    expect(result.inboxItems[0]!.title).toBe("Hi Alice, $42");
  });
});

describe("exported instance preserves payload types across module boundaries", () => {
  test("send() infers payload from an exported NotifyKit instance without casts", async () => {
    const db = memoryAdapter();
    const commentMentioned = notification({
      id: "comment_mentioned",
      payload: {
        actorName: "string",
        postTitle: "string",
        postUrl: "string",
      },
      channels: [inbox({ title: "{{actorName}} mentioned you" })],
    });
    const welcomeNotification = notification({
      id: "welcome",
      payload: { name: "string" },
      channels: [inbox({ title: "Welcome, {{name}}" })],
    });

    const notify = createNotifyKit({
      notifications: [commentMentioned, welcomeNotification] as const,
      database: db,
    });

    await notify.upsertRecipient({ id: "u1" });

    const r1 = await notify.send({
      recipientId: "u1",
      notificationId: "comment_mentioned",
      payload: {
        actorName: "Alice",
        postTitle: "Launch Plan",
        postUrl: "/posts/42",
      },
    });
    expect(r1.notification).not.toBeNull();
    expect(r1.inboxItems[0]!.title).toBe("Alice mentioned you");

    const r2 = await notify.send({
      recipientId: "u1",
      notificationId: "welcome",
      payload: { name: "friend" },
    });
    expect(r2.notification).not.toBeNull();
    expect(r2.inboxItems[0]!.title).toBe("Welcome, friend");
  });

  test("wrong notification ID is a compile-time error", () => {
    const def = notification({
      id: "only_one",
      payload: { msg: "string" },
      channels: [inbox({ title: "{{msg}}" })],
    });
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: memoryAdapter(),
    });
    const _bad: Parameters<typeof notify.send>[0] = {
      recipientId: "u1",
      // @ts-expect-error — "nonexistent" is not a valid notification ID
      notificationId: "nonexistent",
      payload: { msg: "hi" },
    };
  });

  test("wrong payload shape is a compile-time error", () => {
    const def = notification({
      id: "typed",
      payload: { name: "string", count: "number" },
      channels: [inbox({ title: "{{name}}" })],
    });
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: memoryAdapter(),
    });
    const _bad: Parameters<typeof notify.send>[0] = {
      recipientId: "u1",
      notificationId: "typed",
      // @ts-expect-error — missing "count" field
      payload: { name: "hi" },
    };
  });
});

describe("arktypePayload adapter", () => {
  test("derives PayloadSchema and validate from an ArkType object", async () => {
    const { type } = await import("arktype");
    const { arktypePayload } = await import("../src/arktype.js");

    const { payload, validate } = arktypePayload(
      type({ name: "string", count: "number" }),
    );
    expect(payload).toEqual({ name: "string", count: "number" });
    expect(validate({ name: "Alice", count: 5 })).toEqual({
      name: "Alice",
      count: 5,
    });
  });

  test("validate throws on invalid input", async () => {
    const { type } = await import("arktype");
    const { arktypePayload } = await import("../src/arktype.js");

    const { validate } = arktypePayload(
      type({ name: "string" }),
    );
    expect(() => validate({ name: 123 })).toThrow();
  });

  test("boolean fields are included in inferred schema", async () => {
    const { type } = await import("arktype");
    const { arktypePayload } = await import("../src/arktype.js");

    const { payload } = arktypePayload(
      type({ active: "boolean", name: "string" }),
    );
    expect(payload).toEqual({ active: "boolean", name: "string" });
  });

  test("constrained fields are omitted and warn", async () => {
    const { type } = await import("arktype");
    const { arktypePayload } = await import("../src/arktype.js");

    const warnSpy = spyOn(console, "warn").mockImplementation(() => {});
    const { payload } = arktypePayload(
      type({ name: "string", age: "number > 0" }),
    );
    expect(payload).toEqual({ name: "string" });
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]![0]).toMatch(/age.*not mapped/i);
    warnSpy.mockRestore();
  });

  test("works end-to-end with notification() and createNotifyKit()", async () => {
    const { type } = await import("arktype");
    const { arktypePayload } = await import("../src/arktype.js");

    const { payload, validate } = arktypePayload(
      type({ name: "string", amount: "number" }),
    );
    const def = notification({
      id: "arktype_test",
      payload,
      validate,
      channels: [inbox({ title: "Hi {{name}}, ${{amount}}" })],
    });
    const db = memoryAdapter();
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: db,
    });
    await notify.upsertRecipient({ id: "u1" });
    const result = await notify.send({
      recipientId: "u1",
      notificationId: "arktype_test",
      payload: { name: "Alice", amount: 42 },
    });
    expect(result.notification!.payload).toEqual({ name: "Alice", amount: 42 });
    expect(result.inboxItems[0]!.title).toBe("Hi Alice, $42");
  });
});
