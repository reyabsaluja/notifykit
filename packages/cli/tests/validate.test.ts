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
});
