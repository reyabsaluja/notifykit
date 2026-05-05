import type { EmailProvider } from "notifykit";

export type ResendProviderOptions = {
  /** Resend API key. Required. */
  apiKey: string;
  /** Default "from" address, e.g. "Acme <no-reply@acme.com>". Required. */
  from: string;
  /** Default reply-to address. Optional. */
  replyTo?: string | string[];
  /** Override the Resend API base URL. Defaults to "https://api.resend.com". */
  baseUrl?: string;
  /** Request timeout in milliseconds. Defaults to 10_000. */
  timeoutMs?: number;
  /** Custom fetch — defaults to global fetch. Useful for tests and runtimes with a polyfill. */
  fetch?: typeof fetch;
};

type ResendEmailResponse = {
  id?: string;
  // Error shape per Resend docs:
  name?: string;
  message?: string;
  statusCode?: number;
};

/**
 * Send email via Resend's REST API. The body argument is treated as plain
 * text; if you need HTML rendering, pre-render before calling send() or
 * wrap this provider to set `html` instead of `text`.
 */
export function resendProvider(options: ResendProviderOptions): EmailProvider {
  if (!options.apiKey) {
    throw new Error("resendProvider: `apiKey` is required.");
  }
  if (!options.from) {
    throw new Error("resendProvider: `from` is required.");
  }

  const baseUrl = (options.baseUrl ?? "https://api.resend.com").replace(
    /\/+$/,
    "",
  );
  const timeoutMs = options.timeoutMs ?? 10_000;
  const fetchImpl = options.fetch ?? globalThis.fetch;
  if (!fetchImpl) {
    throw new Error(
      "resendProvider: no fetch implementation available. Pass `fetch` in options.",
    );
  }

  return {
    id: "resend",
    async send(input) {
      const body: Record<string, unknown> = {
        from: options.from,
        to: input.to,
        subject: input.subject,
        text: input.body,
      };
      if (options.replyTo !== undefined) {
        body.reply_to = options.replyTo;
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      let res: Response;
      try {
        res = await fetchImpl(`${baseUrl}/emails`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${options.apiKey}`,
            "content-type": "application/json",
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
      } catch (err) {
        clearTimeout(timer);
        if (err instanceof Error && err.name === "AbortError") {
          throw new Error(`Resend request timed out after ${timeoutMs}ms`);
        }
        throw err;
      } finally {
        clearTimeout(timer);
      }

      const json = (await res.json().catch(() => null)) as
        | ResendEmailResponse
        | null;

      if (!res.ok) {
        const detail = json?.message ?? `${res.status} ${res.statusText}`;
        throw new Error(`Resend send failed: ${detail}`);
      }
      if (!json?.id) {
        throw new Error("Resend send returned 2xx but no `id`.");
      }
      return { providerMessageId: json.id };
    },
  };
}
