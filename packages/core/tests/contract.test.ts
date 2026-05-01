import { describe, expect, test } from "bun:test";
import {
  channel,
  createNotifyKit,
  fakeEmailProvider,
  memoryAdapter,
  notification,
  redactPayload,
} from "../src/index.js";

const inbox = channel.inbox();
const email = channel.email();

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

  test("redactPayload for unknown notification returns payload as-is", () => {
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
    expect(notify.redactPayload("unknown_id", payload)).toBe(payload);
  });
});

describe("startup validation", () => {
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

  test("rejects email channel without email provider", () => {
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
});
