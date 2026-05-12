import { createHmac, timingSafeEqual } from "node:crypto";
import type { EmailProvider, SmsProvider, WebhookProvider } from "./types.js";
import { NotifyKitError, createId } from "./utils.js";

export type SentEmail = {
  to: string;
  subject: string;
  body: string;
  providerMessageId: string;
  sentAt: Date;
};

export type FakeEmailProviderOptions = {
  failOnNext?: boolean;
};

export type FakeEmailProvider = EmailProvider & {
  sent: SentEmail[];
  setFailOnNext(value: boolean): void;
  clear(): void;
};

export function fakeEmailProvider(
  options: FakeEmailProviderOptions = {},
): FakeEmailProvider {
  const sent: SentEmail[] = [];
  let failOnNext = options.failOnNext ?? false;

  return {
    id: "fake",
    sent,
    setFailOnNext(value: boolean) {
      failOnNext = value;
    },
    clear() {
      sent.length = 0;
    },
    async send(input) {
      if (failOnNext) {
        failOnNext = false;
        throw new Error("fakeEmailProvider: simulated failure");
      }
      const providerMessageId = createId("fake");
      sent.push({
        to: input.to,
        subject: input.subject,
        body: input.body,
        providerMessageId,
        sentAt: new Date(),
      });
      return { providerMessageId };
    },
  };
}

export type WebhookProviderOptions = {
  /**
   * Optional HMAC-SHA256 signing secret. When set, every request includes
   * `x-notifykit-signature: sha256=<hex>` computed over the JSON body.
   */
  secret?: string;
  /** Request timeout in ms. Defaults to 10_000. */
  timeoutMs?: number;
  /** Custom fetch — defaults to global fetch. Useful for tests and SSR. */
  fetch?: typeof fetch;
};

export function webhookProvider(
  options: WebhookProviderOptions = {},
): WebhookProvider {
  const timeoutMs = options.timeoutMs ?? 10_000;
  const fetchImpl = options.fetch ?? globalThis.fetch;
  if (!fetchImpl) {
    throw new NotifyKitError(
      "webhookProvider requires a fetch implementation but none is available.",
      {
        code: "MISSING_FETCH",
        channel: "webhook",
        fix: "Pass { fetch: globalThis.fetch } in options, or use Node >= 18 which has built-in fetch.",
      },
    );
  }

  return {
    id: "webhook",
    signed: !!options.secret,
    async send(input) {
      const body = JSON.stringify(input.payload);
      const headers: Record<string, string> = {
        ...input.headers,
        "content-type": "application/json",
        "user-agent": "notifykit/0.x",
      };
      if (options.secret) {
        headers["x-notifykit-signature"] = `sha256=${createHmac(
          "sha256",
          options.secret,
        )
          .update(body)
          .digest("hex")}`;
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      let res: Response;
      try {
        res = await fetchImpl(input.url, {
          method: "POST",
          headers,
          body,
          signal: controller.signal,
          redirect: "error",
        });
      } catch (fetchErr) {
        if (fetchErr instanceof TypeError && String(fetchErr.message).toLowerCase().includes("redirect")) {
          throw new NotifyKitError(
            `Webhook delivery to ${input.url} failed: server returned a redirect.`,
            {
              code: "WEBHOOK_REDIRECT_BLOCKED",
              channel: "webhook",
              fix: "Webhook URLs must not redirect. Update the URL to point directly to the final destination. Redirects are blocked to prevent SSRF.",
            },
          );
        }
        throw fetchErr;
      } finally {
        clearTimeout(timer);
      }

      if (!res.ok) {
        await res.body?.cancel().catch(() => {});
        throw new NotifyKitError(
          `Webhook delivery to ${input.url} failed: HTTP ${res.status} ${res.statusText}.`,
          {
            code: "WEBHOOK_HTTP_ERROR",
            channel: "webhook",
            fix: `The remote server returned ${res.status}. Verify the URL is correct and the endpoint is healthy.`,
          },
        );
      }
      await res.body?.cancel().catch(() => {});
      const providerMessageId =
        res.headers.get("x-request-id") ?? res.headers.get("request-id") ?? undefined;
      return providerMessageId ? { providerMessageId } : {};
    },
  };
}

export type SentWebhook = {
  url: string;
  headers: Record<string, string>;
  payload: Record<string, unknown>;
  providerMessageId: string;
  sentAt: Date;
};

export type FakeWebhookProviderOptions = {
  failOnNext?: boolean;
};

export type FakeWebhookProvider = WebhookProvider & {
  sent: SentWebhook[];
  setFailOnNext(value: boolean): void;
  clear(): void;
};

export function fakeWebhookProvider(
  options: FakeWebhookProviderOptions = {},
): FakeWebhookProvider {
  const sent: SentWebhook[] = [];
  let failOnNext = options.failOnNext ?? false;

  return {
    id: "fake-webhook",
    sent,
    setFailOnNext(value: boolean) {
      failOnNext = value;
    },
    clear() {
      sent.length = 0;
    },
    async send(input) {
      if (failOnNext) {
        failOnNext = false;
        throw new Error("fakeWebhookProvider: simulated failure");
      }
      const providerMessageId = createId("fhook");
      sent.push({
        url: input.url,
        headers: input.headers,
        payload: input.payload,
        providerMessageId,
        sentAt: new Date(),
      });
      return { providerMessageId };
    },
  };
}

export type SentSms = {
  to: string;
  body: string;
  providerMessageId: string;
  sentAt: Date;
};

export type FakeSmsProviderOptions = {
  failOnNext?: boolean;
};

export type FakeSmsProvider = SmsProvider & {
  sent: SentSms[];
  setFailOnNext(value: boolean): void;
  clear(): void;
};

export function fakeSmsProvider(
  options: FakeSmsProviderOptions = {},
): FakeSmsProvider {
  const sent: SentSms[] = [];
  let failOnNext = options.failOnNext ?? false;

  return {
    id: "fake-sms",
    sent,
    setFailOnNext(value: boolean) {
      failOnNext = value;
    },
    clear() {
      sent.length = 0;
    },
    async send(input) {
      if (failOnNext) {
        failOnNext = false;
        throw new Error("fakeSmsProvider: simulated failure");
      }
      const providerMessageId = createId("fsms");
      sent.push({
        to: input.to,
        body: input.body,
        providerMessageId,
        sentAt: new Date(),
      });
      return { providerMessageId };
    },
  };
}

/**
 * Verify the HMAC-SHA256 signature on an incoming webhook request body.
 *
 * Use this in your webhook ingestion endpoint to confirm that a request
 * was actually sent by NotifyKit (or anyone holding the shared secret).
 *
 * @returns `true` if the signature is present and valid; `false` otherwise.
 */
export function verifyWebhookSignature(
  body: string,
  signatureHeader: string | null | undefined,
  secret: string,
): boolean {
  if (!signatureHeader) return false;
  const prefix = "sha256=";
  if (!signatureHeader.startsWith(prefix)) return false;
  const expected = createHmac("sha256", secret).update(body).digest("hex");
  const received = signatureHeader.slice(prefix.length);
  if (received.length !== expected.length) return false;
  if (!/^[0-9a-f]+$/.test(received)) return false;
  return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(received, "hex"));
}
