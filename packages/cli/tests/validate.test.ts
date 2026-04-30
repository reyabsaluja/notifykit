import { describe, expect, test } from "bun:test";
import { channel, notification } from "notifykit";
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
    expect(validateNotifications([ok])).toEqual([]);
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
    const issues = validateNotifications([bad]);
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
});
