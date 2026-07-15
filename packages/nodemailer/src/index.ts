import type { EmailProvider } from "@notifykitjs/core";
import { createTransport, type Transporter, type TransportOptions } from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";

type ProviderError = Error & {
  code?: string | number;
  responseCode?: number;
  permanent?: true;
};

export type NodemailerProviderOptions = {
  /** Default "from" address, e.g. "Acme <no-reply@acme.com>". Required. */
  from: string;
  /** Default reply-to address. Optional. */
  replyTo?: string | string[];
  /** Send timeout in milliseconds. Defaults to 10_000. */
  timeoutMs?: number;
} & (
  | {
      /** SMTP connection URL, e.g. "smtps://user:pass@smtp.example.com:465". */
      url: string;
      transport?: never;
      host?: never;
      port?: never;
      auth?: never;
      secure?: never;
    }
  | {
      /** SMTP host. */
      host: string;
      /** SMTP port. Defaults to 587. */
      port?: number;
      /** Authentication credentials. */
      auth?: { user: string; pass: string };
      /** Use TLS. Defaults to true for port 465, false otherwise. */
      secure?: boolean;
      url?: never;
      transport?: never;
    }
  | {
      /** Pre-configured Nodemailer transport instance. */
      transport: Transporter;
      url?: never;
      host?: never;
      port?: never;
      auth?: never;
      secure?: never;
    }
);

export function nodemailerProvider(options: NodemailerProviderOptions): EmailProvider {
  if (!options.from) {
    throw new Error("nodemailerProvider: `from` is required.");
  }

  const timeoutMs = options.timeoutMs ?? 10_000;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error("nodemailerProvider: `timeoutMs` must be a positive number.");
  }

  let transporter: Transporter;

  if ("transport" in options && options.transport) {
    transporter = options.transport;
  } else if ("url" in options && options.url) {
    if (!options.url) {
      throw new Error("nodemailerProvider: `url` must be a non-empty string.");
    }
    transporter = createTransport(options.url);
  } else if ("host" in options && options.host) {
    if (!options.host) {
      throw new Error("nodemailerProvider: `host` must be a non-empty string.");
    }
    transporter = createTransport({
      host: options.host,
      port: options.port ?? 587,
      secure: options.secure,
      auth: options.auth,
    } as SMTPTransport.Options);
  } else {
    throw new Error(
      "nodemailerProvider: provide one of `url`, `host`, or `transport`.",
    );
  }

  return {
    id: "nodemailer",
    async send(input) {
      const mail: Record<string, unknown> = {
        from: options.from,
        to: input.to,
        subject: input.subject,
        html: input.body,
      };
      if (options.replyTo !== undefined) {
        mail.replyTo = options.replyTo;
      }

      let info: { messageId?: string };
      try {
        info = await Promise.race([
          transporter.sendMail(mail),
          new Promise<never>((_, reject) =>
            setTimeout(
              () => reject(new Error(`Nodemailer send timed out after ${timeoutMs}ms`)),
              timeoutMs,
            ),
          ),
        ]);
      } catch (err: unknown) {
        const error = err instanceof Error ? err : new Error(String(err));
        if (isPermanent(error)) {
          (error as ProviderError).permanent = true;
        }
        throw error;
      }

      const messageId = info.messageId
        ? info.messageId.replace(/^<|>$/g, "")
        : undefined;

      return { providerMessageId: messageId };
    },
  };
}

function isPermanent(err: Error): boolean {
  const msg = err.message.toLowerCase();
  const providerError = err as ProviderError;
  const code = providerError.responseCode ?? providerError.code;
  if (typeof code === "number" && code >= 500 && code <= 599) {
    if (msg.includes("mailbox") || msg.includes("user") || msg.includes("recipient")) {
      return true;
    }
  }
  if (code === 550 || code === 551 || code === 552 || code === 553 || code === 554) {
    return true;
  }
  if (msg.includes("invalid") && msg.includes("address")) return true;
  if (msg.includes("no such user")) return true;
  if (msg.includes("does not exist")) return true;
  return false;
}
