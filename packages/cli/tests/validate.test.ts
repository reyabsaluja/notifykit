import { describe, expect, test } from "bun:test";
import { channel, notification, fakeEmailProvider } from "@notifykitjs/core";
import { validateNotifications } from "../src/validate.js";

const inbox = channel.inbox();
const email = channel.email();

describe("validateNotifications", () => {
  test("passes for clean definitions", () => {
    const ok = notification({
      id: "welcome",
      payload: { name: "string" },
      channels: [
        inbox({ title: "Hello, {{name}}" }),
        email({ subject: "Hi {{name}}", body: "Welcome, {{name}}!" }),
      ],
    });
    expect(validateNotifications([ok], { providers: { email: fakeEmailProvider() } })).toEqual([]);
  });

  test("flags unknown template key in inbox title", () => {
    const bad = notification({
      id: "bad_title",
      payload: { name: "string" },
      channels: [inbox({ title: "Hi {{nmae}}" })],
    });
    const issues = validateNotifications([bad]);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.notificationId).toBe("bad_title");
    expect(issues[0]!.field).toBe("title");
    expect(issues[0]!.message).toMatch(/nmae/);
  });

  test("flags unknown keys across multiple fields", () => {
    const bad = notification({
      id: "bad",
      payload: { a: "string" },
      channels: [
        inbox({
          title: "{{a}}",
          body: "{{b}}",
          actionUrl: "{{c}}",
        }),
        email({ subject: "{{a}} {{d}}", body: "plain {{a}}" }),
      ],
    });
    const issues = validateNotifications([bad], { providers: { email: fakeEmailProvider() } });
    const keys = issues.map((i) => `${i.field}:${i.message.match(/"\{\{(\w+)\}\}"/)?.[1] ?? ""}`);
    expect(keys).toContain("body:b");
    expect(keys).toContain("actionUrl:c");
    expect(keys).toContain("subject:d");
  });

  test("ignores valid keys referenced multiple times", () => {
    const def = notification({
      id: "double",
      payload: { name: "string" },
      channels: [
        inbox({ title: "{{name}} {{name}}", body: "{{name}}" }),
      ],
    });
    expect(validateNotifications([def])).toEqual([]);
  });

  test("flags duplicate notification ids", () => {
    const a = notification({
      id: "same",
      payload: { x: "string" },
      channels: [inbox({ title: "{{x}}" })],
    });
    const b = notification({
      id: "same",
      payload: { x: "string" },
      channels: [inbox({ title: "{{x}}" })],
    });
    const issues = validateNotifications([a, b]);
    expect(issues.some((i) => i.message.includes("Duplicate"))).toBe(true);
  });

  test("flags missing provider when email channel used without providers", () => {
    const def = notification({
      id: "need_email",
      payload: { x: "string" },
      channels: [
        inbox({ title: "{{x}}" }),
        email({ subject: "{{x}}", body: "body" }),
      ],
    });
    const issues = validateNotifications([def]);
    expect(issues.some((i) => i.code === "MISSING_PROVIDER")).toBe(true);
  });

  test("no missing provider error when email provider is passed", () => {
    const def = notification({
      id: "has_email",
      payload: { x: "string" },
      channels: [
        email({ subject: "{{x}}", body: "body" }),
      ],
    });
    const issues = validateNotifications([def], { providers: { email: fakeEmailProvider() } });
    expect(issues.filter((i) => i.code === "MISSING_PROVIDER")).toEqual([]);
  });

  test("flags unsupported payload schema type", () => {
    const def = notification({
      id: "bad_schema",
      payload: { count: "integer" as never },
      channels: [inbox({ title: "hi" })],
    });
    const issues = validateNotifications([def]);
    expect(issues.some((i) => i.code === "INVALID_SCHEMA_TYPE")).toBe(true);
    expect(issues[0]!.message).toMatch(/integer/);
  });

  test("flags missing email subject (channel shape)", () => {
    const def = notification({
      id: "bad_email",
      payload: { x: "string" },
      channels: [{ type: "email", subject: "", body: "ok" } as never],
    });
    const issues = validateNotifications([def], { providers: { email: fakeEmailProvider() } });
    expect(issues.some((i) => i.code === "INVALID_CHANNEL_SHAPE")).toBe(true);
  });

  test("flags invalid fallback from channel", () => {
    const def = notification({
      id: "bad_fb",
      payload: { x: "string" },
      channels: [inbox({ title: "{{x}}" })],
      fallback: [
        { if: "channel.failed", from: "push" as never, then: inbox({ title: "fallback" }) },
      ],
    });
    const issues = validateNotifications([def]);
    expect(issues.some((i) => i.code === "INVALID_FALLBACK_FROM")).toBe(true);
  });

  test("flags unknown channel type in defaults.channels", () => {
    const def = notification({
      id: "ok",
      payload: { x: "string" },
      channels: [inbox({ title: "{{x}}" })],
    });
    const issues = validateNotifications([def], {
      defaults: { channels: { push: true } as never },
    });
    expect(issues.some((i) => i.code === "INVALID_DEFAULT_CHANNEL_TYPE")).toBe(true);
  });

  test("flags unknown channel type in category defaults", () => {
    const def = notification({
      id: "cat_test",
      payload: { x: "string" },
      channels: [inbox({ title: "{{x}}" })],
      category: "billing",
    });
    const issues = validateNotifications([def], {
      defaults: { categories: { billing: { push: true } as never } },
    });
    expect(issues.some((i) => i.code === "INVALID_CATEGORY_CHANNEL")).toBe(true);
  });

  test("flags empty unsubscribe.baseUrl", () => {
    const def = notification({
      id: "unsub_empty",
      payload: { x: "string" },
      channels: [inbox({ title: "{{x}}" })],
    });
    const issues = validateNotifications([def], {
      unsubscribe: { secret: "a".repeat(32), baseUrl: "" },
    });
    expect(issues.some((i) => i.code === "INVALID_UNSUBSCRIBE_URL")).toBe(true);
  });

  test("flags unsubscribe.baseUrl without scheme", () => {
    const def = notification({
      id: "unsub_noscheme",
      payload: { x: "string" },
      channels: [inbox({ title: "{{x}}" })],
    });
    const issues = validateNotifications([def], {
      unsubscribe: { secret: "a".repeat(32), baseUrl: "app.com/api/notifykit" },
    });
    expect(issues.some((i) => i.code === "INVALID_UNSUBSCRIBE_URL")).toBe(true);
    expect(issues[0]!.message).toMatch(/http/);
  });

  test("passes valid unsubscribe config", () => {
    const def = notification({
      id: "unsub_ok",
      payload: { x: "string" },
      channels: [inbox({ title: "{{x}}" })],
    });
    const issues = validateNotifications([def], {
      unsubscribe: { secret: "a".repeat(32), baseUrl: "https://app.com/api/notifykit" },
    });
    expect(issues.filter((i) => i.code === "INVALID_UNSUBSCRIBE_URL")).toEqual([]);
  });

  test("flags negative idempotencyKeyTtlMs", () => {
    const def = notification({
      id: "ttl_bad",
      payload: { x: "string" },
      channels: [inbox({ title: "{{x}}" })],
    });
    const issues = validateNotifications([def], {
      idempotencyKeyTtlMs: -1,
    });
    expect(issues.some((i) => i.code === "INVALID_IDEMPOTENCY_TTL")).toBe(true);
  });

  test("flags zero idempotencyKeyTtlMs", () => {
    const def = notification({
      id: "ttl_zero",
      payload: { x: "string" },
      channels: [inbox({ title: "{{x}}" })],
    });
    const issues = validateNotifications([def], {
      idempotencyKeyTtlMs: 0,
    });
    expect(issues.some((i) => i.code === "INVALID_IDEMPOTENCY_TTL")).toBe(true);
  });

  test("passes valid idempotencyKeyTtlMs", () => {
    const def = notification({
      id: "ttl_ok",
      payload: { x: "string" },
      channels: [inbox({ title: "{{x}}" })],
    });
    const issues = validateNotifications([def], {
      idempotencyKeyTtlMs: 86400000,
    });
    expect(issues.filter((i) => i.code === "INVALID_IDEMPOTENCY_TTL")).toEqual([]);
  });

  test("flags negative timelineRetentionMs", () => {
    const def = notification({
      id: "ret_bad",
      payload: { x: "string" },
      channels: [inbox({ title: "{{x}}" })],
    });
    const issues = validateNotifications([def], {
      timelineRetentionMs: -100,
    });
    expect(issues.some((i) => i.code === "INVALID_TIMELINE_RETENTION")).toBe(true);
  });

  test("passes zero timelineRetentionMs (disable)", () => {
    const def = notification({
      id: "ret_zero",
      payload: { x: "string" },
      channels: [inbox({ title: "{{x}}" })],
    });
    const issues = validateNotifications([def], {
      timelineRetentionMs: 0,
    });
    expect(issues.filter((i) => i.code === "INVALID_TIMELINE_RETENTION")).toEqual([]);
  });

  test("flags missing digests adapter when notification uses digest", () => {
    const def = notification({
      id: "needs_digest",
      payload: { x: "string" },
      channels: [inbox({ title: "{{x}}" })],
      digest: {
        windowMs: 60000,
        render: ({ payloads }) => payloads[0]!,
      },
    });
    const issues = validateNotifications([def], {
      database: { digests: undefined, rateLimits: {} },
    });
    expect(issues.some((i) => i.code === "MISSING_ADAPTER_CAPABILITY" && i.field === "database.digests")).toBe(true);
  });

  test("flags missing rateLimits adapter when notification uses rateLimit", () => {
    const def = notification({
      id: "needs_rl",
      payload: { x: "string" },
      channels: [inbox({ title: "{{x}}" })],
      rateLimit: { max: 5, windowMs: 60000 },
    });
    const issues = validateNotifications([def], {
      database: { digests: {}, rateLimits: undefined },
    });
    expect(issues.some((i) => i.code === "MISSING_ADAPTER_CAPABILITY" && i.field === "database.rateLimits")).toBe(true);
  });

  test("passes when adapter capabilities match notification features", () => {
    const def = notification({
      id: "has_both",
      payload: { x: "string" },
      channels: [inbox({ title: "{{x}}" })],
      digest: {
        windowMs: 60000,
        render: ({ payloads }) => payloads[0]!,
      },
      rateLimit: { max: 5, windowMs: 60000 },
    });
    const issues = validateNotifications([def], {
      database: { digests: {}, rateLimits: {} },
    });
    expect(issues.filter((i) => i.code === "MISSING_ADAPTER_CAPABILITY")).toEqual([]);
  });

  test("warns when webhook provider has no signing secret", () => {
    const def = notification({
      id: "webhook_nosign",
      payload: { x: "string" },
      channels: [{ type: "webhook", url: "https://example.com/hook" } as never],
    });
    const issues = validateNotifications([def], {
      providers: { webhook: { id: "webhook", signed: false, send: async () => ({}) } },
      webhookSigned: false,
    });
    expect(issues.some((i) => i.code === "WEBHOOK_NO_SECRET")).toBe(true);
  });

  test("no webhook warning when signed", () => {
    const def = notification({
      id: "webhook_signed",
      payload: { x: "string" },
      channels: [{ type: "webhook", url: "https://example.com/hook" } as never],
    });
    const issues = validateNotifications([def], {
      providers: { webhook: { id: "webhook", signed: true, send: async () => ({}) } },
      webhookSigned: true,
    });
    expect(issues.filter((i) => i.code === "WEBHOOK_NO_SECRET")).toEqual([]);
  });
});
