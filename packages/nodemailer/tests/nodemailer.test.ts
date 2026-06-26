import { describe, expect, test } from "bun:test";
import {
  channel,
  createNotifyKit,
  memoryAdapter,
  notification,
} from "@notifykitjs/core";
import { nodemailerProvider } from "../src/index.js";
import { createTransport } from "nodemailer";

function makeStubTransport(
  responder: () => { messageId: string } | Error,
) {
  const calls: Array<Record<string, unknown>> = [];
  const transport = {
    sendMail(mail: Record<string, unknown>) {
      calls.push(mail);
      const result = responder();
      if (result instanceof Error) return Promise.reject(result);
      return Promise.resolve(result);
    },
  };
  return { transport: transport as any, calls };
}

describe("nodemailerProvider", () => {
  test("constructor validation", () => {
    expect(() =>
      nodemailerProvider({ from: "", host: "smtp.test.com" } as any),
    ).toThrow(/from/);
    expect(() =>
      nodemailerProvider({ from: "a@b.c", host: "smtp.test.com", timeoutMs: 0 }),
    ).toThrow(/timeoutMs/);
    expect(() =>
      nodemailerProvider({ from: "a@b.c", host: "smtp.test.com", timeoutMs: Number.NaN }),
    ).toThrow(/timeoutMs/);
    expect(() =>
      nodemailerProvider({ from: "a@b.c" } as any),
    ).toThrow(/provide one of/);
  });

  test("accepts url configuration", () => {
    const provider = nodemailerProvider({
      from: "a@b.c",
      url: "smtp://user:pass@smtp.example.com:587",
    });
    expect(provider.id).toBe("nodemailer");
  });

  test("accepts host configuration", () => {
    const provider = nodemailerProvider({
      from: "a@b.c",
      host: "smtp.sendgrid.net",
      port: 587,
      auth: { user: "apikey", pass: "SG.xxx" },
    });
    expect(provider.id).toBe("nodemailer");
  });

  test("accepts pre-built transport", () => {
    const transport = createTransport({ jsonTransport: true });
    const provider = nodemailerProvider({
      from: "a@b.c",
      transport,
    });
    expect(provider.id).toBe("nodemailer");
  });

  test("sends email with correct shape", async () => {
    const { transport, calls } = makeStubTransport(() => ({
      messageId: "<abc123@mail.example.com>",
    }));
    const provider = nodemailerProvider({
      from: "Acme <no-reply@acme.com>",
      transport: transport as any,
    });
    const result = await provider.send({
      to: "jane@example.com",
      subject: "Hello",
      body: "<p>Welcome!</p>",
    });
    expect(result.providerMessageId).toBe("abc123@mail.example.com");
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({
      from: "Acme <no-reply@acme.com>",
      to: "jane@example.com",
      subject: "Hello",
      html: "<p>Welcome!</p>",
    });
  });

  test("includes replyTo when configured", async () => {
    const { transport, calls } = makeStubTransport(() => ({
      messageId: "<x@y.com>",
    }));
    const provider = nodemailerProvider({
      from: "a@b.c",
      replyTo: "support@acme.com",
      transport: transport as any,
    });
    await provider.send({ to: "u@x.com", subject: "s", body: "b" });
    expect(calls[0]!.replyTo).toBe("support@acme.com");
  });

  test("handles missing messageId gracefully", async () => {
    const { transport } = makeStubTransport(() => ({
      messageId: "",
    }));
    const provider = nodemailerProvider({
      from: "a@b.c",
      transport: transport as any,
    });
    const result = await provider.send({
      to: "u@x.com",
      subject: "s",
      body: "b",
    });
    expect(result.providerMessageId).toBeUndefined();
  });

  test("throws on transport error", async () => {
    const { transport } = makeStubTransport(() => new Error("Connection refused"));
    const provider = nodemailerProvider({
      from: "a@b.c",
      transport: transport as any,
    });
    await expect(
      provider.send({ to: "u@x.com", subject: "s", body: "b" }),
    ).rejects.toThrow(/Connection refused/);
  });

  test("marks permanent SMTP errors", async () => {
    const err = Object.assign(new Error("Mailbox not found"), {
      responseCode: 550,
    });
    const { transport } = makeStubTransport(() => err);
    const provider = nodemailerProvider({
      from: "a@b.c",
      transport: transport as any,
    });
    try {
      await provider.send({ to: "bad@x.com", subject: "s", body: "b" });
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.permanent).toBe(true);
    }
  });

  test("does not mark transient errors as permanent", async () => {
    const err = Object.assign(new Error("Connection timeout"), {
      responseCode: 421,
    });
    const { transport } = makeStubTransport(() => err);
    const provider = nodemailerProvider({
      from: "a@b.c",
      transport: transport as any,
    });
    try {
      await provider.send({ to: "u@x.com", subject: "s", body: "b" });
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.permanent).toBeUndefined();
    }
  });

  test("times out after configured duration", async () => {
    const transport = {
      sendMail() {
        return new Promise(() => {});
      },
    };
    const provider = nodemailerProvider({
      from: "a@b.c",
      transport: transport as any,
      timeoutMs: 50,
    });
    await expect(
      provider.send({ to: "u@x.com", subject: "s", body: "b" }),
    ).rejects.toThrow(/timed out/);
  });

  test("integrates with createNotifyKit end-to-end", async () => {
    const { transport, calls } = makeStubTransport(() => ({
      messageId: "<integration_1@mail.com>",
    }));
    const emailCh = channel.email();
    const def = notification({
      id: "welcome",
      payload: { name: "string" },
      channels: [
        emailCh({ subject: "Hello {{name}}", body: "Welcome, {{name}}." }),
      ],
    });
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: memoryAdapter(),
      providers: {
        email: nodemailerProvider({
          from: "Acme <no-reply@acme.com>",
          transport: transport as any,
        }),
      },
    });
    await notify.upsertRecipient({ id: "u1", email: "jane@example.com" });
    const result = await notify.send({
      recipientId: "u1",
      notificationId: "welcome",
      payload: { name: "Jane" },
    });
    expect(result.deliveries[0]!.status).toBe("sent");
    expect(result.deliveries[0]!.providerMessageId).toBe(
      "integration_1@mail.com",
    );
    expect(result.deliveries[0]!.provider).toBe("nodemailer");
    expect(calls[0]!.subject).toBe("Hello Jane");
    expect(calls[0]!.html).toBe("Welcome, Jane.");
    expect(calls[0]!.to).toBe("jane@example.com");
  });

  test("failures propagate through retry + fallback pipeline", async () => {
    let attempts = 0;
    const transport = {
      sendMail() {
        attempts++;
        return Promise.reject(new Error(`SMTP error ${attempts}`));
      },
    };
    const inboxCh = channel.inbox();
    const emailCh = channel.email();
    const def = notification({
      id: "reset",
      payload: { link: "string" },
      channels: [emailCh({ subject: "Reset", body: "{{link}}" })],
      fallback: inboxCh({ title: "Fallback for {{link}}" }),
    });
    const notify = createNotifyKit({
      notifications: [def] as const,
      database: memoryAdapter(),
      providers: {
        email: nodemailerProvider({
          from: "a@b.c",
          transport: transport as any,
        }),
      },
      retry: { maxAttempts: 2, delayMs: () => 0 },
    });
    await notify.upsertRecipient({ id: "u1", email: "u@x.com" });
    const result = await notify.send({
      recipientId: "u1",
      notificationId: "reset",
      payload: { link: "/r/1" },
    });
    expect(attempts).toBe(2);
    expect(result.deliveries[0]!.status).toBe("failed");
    const items = await notify.inbox.list("u1");
    expect(items).toHaveLength(1);
    expect(items[0]!.title).toBe("Fallback for /r/1");
  });
});
