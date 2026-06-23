import { randomBytes } from "node:crypto";
import type { PayloadFieldError, PayloadSchema, PayloadValidationResult } from "./types.js";

export function createId(prefix: string): string {
  const rand = randomBytes(12).toString("base64url");
  const time = Date.now().toString(36);
  return `${prefix}_${time}${rand}`;
}

export function renderTemplate(
  template: string,
  payload: Record<string, unknown>,
  options?: { escapeHtml?: boolean; encodeUri?: boolean },
): string {
  const encode = options?.encodeUri ?? false;
  const escape = encode ? false : (options?.escapeHtml ?? true);
  return template.replace(/\{\{\s*([\w$]+)\s*\}\}/g, (_match, key: string) => {
    if (!Object.hasOwn(payload, key)) return "";
    const value = payload[key];
    if (value === undefined || value === null) return "";
    const str = String(value);
    if (encode) return encodeURIComponent(str);
    if (escape) return escapeHtmlChars(str);
    return str;
  });
}

function escapeHtmlChars(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function extractTemplateVars(template: string): string[] {
  const vars: string[] = [];
  const re = /\{\{\s*([\w$]+)\s*\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(template)) !== null) {
    if (m[1]) vars.push(m[1]);
  }
  return vars;
}

export type NotifyKitErrorContext = {
  code?: string;
  notificationId?: string;
  channel?: string;
  recipientId?: string;
  field?: string;
  fix?: string;
};

export class NotifyKitError extends Error {
  readonly code: string;
  readonly notificationId?: string;
  readonly channel?: string;
  readonly recipientId?: string;
  readonly field?: string;
  readonly fix?: string;

  constructor(message: string, context?: NotifyKitErrorContext) {
    const fix = context?.fix;
    super(message);
    this.name = "NotifyKitError";
    this.code = context?.code ?? "NOTIFYKIT_ERROR";
    this.notificationId = context?.notificationId;
    this.channel = context?.channel;
    this.recipientId = context?.recipientId;
    this.field = context?.field;
    this.fix = fix;
  }
}

export class PayloadValidationError extends NotifyKitError {
  readonly fields: PayloadFieldError[];

  constructor(
    message: string,
    context?: NotifyKitErrorContext & { fields?: PayloadFieldError[] },
  ) {
    super(message, { code: "PAYLOAD_VALIDATION_ERROR", ...context });
    this.name = "PayloadValidationError";
    this.fields = context?.fields ?? [];
  }
}

export function validatePayload(
  schema: PayloadSchema,
  payload: unknown,
  notificationId: string,
): Record<string, unknown> {
  const result = checkPayload(schema, payload);
  if (!result.valid) {
    const schemaHint = Object.entries(schema).map(([k, v]) => `${k}: ${v}`).join(", ");
    if (result.fields.length === 1 && result.fields[0]!.key === "(root)") {
      throw new PayloadValidationError(
        `Invalid payload for notification "${notificationId}": expected an object.`,
        {
          notificationId,
          fix: `Pass a plain object matching the schema: { ${schemaHint} }.`,
        },
      );
    }
    const details = result.fields.map((e) => `  - ${e.message}`).join("\n");
    throw new PayloadValidationError(
      `Invalid payload for notification "${notificationId}":\n${details}`,
      {
        notificationId,
        fields: result.fields,
        fix: `Check the payload matches schema: { ${schemaHint} }.`,
      },
    );
  }
  const data = payload as Record<string, unknown>;
  const validated: Record<string, unknown> = {};
  for (const key of Object.keys(schema)) {
    validated[key] = data[key];
  }
  return validated;
}

export const PAYLOAD_VALID: Readonly<PayloadValidationResult> = Object.freeze({ valid: true, fields: [] });

export function checkPayload(
  schema: PayloadSchema,
  payload: unknown,
): PayloadValidationResult {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    return {
      valid: false,
      fields: [{
        key: "(root)",
        expected: "object",
        actual: payload === null ? "null" : Array.isArray(payload) ? "array" : typeof payload,
        message: "Expected payload to be a plain object.",
      }],
    };
  }

  const data = payload as Record<string, unknown>;
  const fieldErrors: PayloadFieldError[] = [];

  for (const key of Object.keys(schema)) {
    const expected = schema[key]!;
    const value = data[key];

    if (value === undefined) {
      fieldErrors.push({
        key,
        expected,
        actual: "undefined",
        message: `Missing "${key}" (expected ${expected}).`,
      });
      continue;
    }

    const actual = typeof value;
    const isNan = actual === "number" && Number.isNaN(value);
    if (
      (expected === "string" && actual !== "string") ||
      (expected === "number" && (actual !== "number" || isNan)) ||
      (expected === "boolean" && actual !== "boolean")
    ) {
      const displayActual = isNan ? "NaN" : actual;
      fieldErrors.push({
        key,
        expected,
        actual: displayActual,
        message: `Expected "${key}" to be ${expected}, got ${displayActual}.`,
      });
    }
  }

  return fieldErrors.length === 0 ? PAYLOAD_VALID : { valid: false, fields: fieldErrors };
}

const BLOCKED_HOSTNAME_PATTERNS = [
  /^localhost$/i,
  /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,
  /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,
  /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/,
  /^192\.168\.\d{1,3}\.\d{1,3}$/,
  /^169\.254\.\d{1,3}\.\d{1,3}$/,
  /^0\.0\.0\.0$/,
  /^\[?::\]?$/,
  /^\[?::1\]?$/,
  /^\[?::ffff:/i,
  /^\[?fe80:/i,
  /^\[?fc00:/i,
  /^\[?fd[0-9a-f]{2}:/i,
  /^metadata\.google\.internal$/i,
  /\.internal$/i,
  /\.local$/i,
];

function isNumericIp(hostname: string): boolean {
  if (/^0x[0-9a-f]+$/i.test(hostname)) return true;
  if (/^0[0-7]+$/.test(hostname)) return true;
  if (/^\d{8,}$/.test(hostname)) return true;
  const parts = hostname.split(".");
  if (parts.length >= 2 && parts.length <= 4) {
    if (parts.every((p) => /^\d+$/.test(p)) && parts.length < 4) return true;
    if (parts.some((p) => /^0[0-7]*$/.test(p) && p !== "0") || parts.some((p) => /^0x[0-9a-f]+$/i.test(p))) return true;
  }
  return false;
}

function compressIPv6(addr: string): string {
  const stripped = addr.replace(/%.*$/, "");
  const parts = stripped.split(":");
  if (parts.length < 3) return addr;
  const expanded = parts.map((p) => p.padStart(4, "0"));
  if (expanded.length < 8) return addr;
  const full = expanded.join(":");
  const compressed = full
    .replace(/\b0{1,3}/g, "")
    .replace(/(^|:)0(:0)+(:|$)/, "$1::$3")
    .replace(/:{3,}/, "::")
    .replace(/^::$/, "::");
  return compressed;
}

function isBlockedHostname(hostname: string): boolean {
  const clean = hostname.replace(/^\[|\]$/g, "");
  if (isNumericIp(clean)) return true;
  const normalized = clean.includes(":") ? compressIPv6(clean) : clean;
  for (const pattern of BLOCKED_HOSTNAME_PATTERNS) {
    if (pattern.test(normalized)) return true;
  }
  return false;
}

export type SafeWebhookResult = {
  pinnedUrl: string;
  hostHeader: string;
};

type WebhookDnsResolver = (hostname: string) => Promise<string[]>;

export async function assertSafeWebhookUrl(
  url: string,
  options: { resolveHostname?: WebhookDnsResolver } = {},
): Promise<SafeWebhookResult> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new NotifyKitError(`Invalid webhook URL: ${url}`, {
      code: "INVALID_WEBHOOK_URL",
      channel: "webhook",
      fix: "Provide a valid absolute URL starting with https:// or http://.",
    });
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new NotifyKitError(`Webhook URL must use http or https: ${url}`, {
      code: "INVALID_WEBHOOK_URL",
      channel: "webhook",
      fix: `Change the protocol from "${parsed.protocol}" to "https://".`,
    });
  }
  if (parsed.username || parsed.password) {
    throw new NotifyKitError(`Webhook URL must not contain credentials: ${url}`, {
      code: "INVALID_WEBHOOK_URL",
      channel: "webhook",
      fix: "Remove user:password from the URL. Pass auth via webhook headers instead.",
    });
  }
  if (isBlockedHostname(parsed.hostname)) {
    throw new NotifyKitError(
      `Webhook URL points to a blocked address: ${url}`,
      {
        code: "BLOCKED_WEBHOOK_URL",
        channel: "webhook",
        fix: "Webhook URLs cannot target private/internal networks (localhost, 10.x, 192.168.x, etc.).",
      },
    );
  }
  const originalHost = parsed.host;
  const isIpLiteral = /^\d{1,3}(\.\d{1,3}){3}$/.test(parsed.hostname) || parsed.hostname.includes(":");
  if (isIpLiteral) {
    return { pinnedUrl: url, hostHeader: originalHost };
  }
  if (typeof globalThis.process !== "undefined") {
    try {
      const allAddresses: string[] = [];
      if (options.resolveHostname) {
        allAddresses.push(...await options.resolveHostname(parsed.hostname));
      } else {
        const dns = await import("node:dns");
        const resolve4 = dns.promises?.resolve4 ?? dns.resolve4;
        const resolve6 = dns.promises?.resolve6 ?? dns.resolve6;
        const [v4, v6] = await Promise.allSettled([
          (resolve4 as (h: string) => Promise<string[]>)(parsed.hostname),
          (resolve6 as (h: string) => Promise<string[]>)(parsed.hostname),
        ]);
        if (v4.status === "fulfilled") allAddresses.push(...v4.value);
        if (v6.status === "fulfilled") allAddresses.push(...v6.value);
      }
      if (allAddresses.length === 0) {
        throw new NotifyKitError(
          `Webhook URL failed DNS resolution: ${url}`,
          {
            code: "WEBHOOK_DNS_FAILURE",
            channel: "webhook",
            fix: `Ensure "${parsed.hostname}" resolves to a public IP address.`,
          },
        );
      }
      for (const addr of allAddresses) {
        if (isBlockedHostname(addr)) {
          throw new NotifyKitError(
            `Webhook URL resolves to a blocked address: ${url}`,
            {
              code: "BLOCKED_WEBHOOK_URL",
              channel: "webhook",
              fix: `"${parsed.hostname}" resolves to ${addr}, which is a private/internal address. Use a publicly reachable hostname.`,
            },
          );
        }
      }
      if (parsed.protocol === "https:") {
        return { pinnedUrl: parsed.toString(), hostHeader: originalHost };
      }
      const pinnedIp = allAddresses[0]!;
      const pinnedHost = pinnedIp.includes(":") ? `[${pinnedIp}]` : pinnedIp;
      parsed.hostname = pinnedHost;
      return { pinnedUrl: parsed.toString(), hostHeader: originalHost };
    } catch (err) {
      if (err instanceof NotifyKitError) throw err;
      throw new NotifyKitError(
        `Webhook URL failed DNS resolution: ${url}`,
        {
          code: "WEBHOOK_DNS_FAILURE",
          channel: "webhook",
          fix: `Ensure "${parsed.hostname}" resolves to a public IP address.`,
        },
      );
    }
  }
  return { pinnedUrl: url, hostHeader: originalHost };
}

const SAFE_URL_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

export function isSafeUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return SAFE_URL_PROTOCOLS.has(parsed.protocol);
  } catch {
    return /^\/[^/\\]/.test(url);
  }
}

export function sanitizeActionUrl(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    if (!SAFE_URL_PROTOCOLS.has(parsed.protocol)) return undefined;
    return parsed.toString();
  } catch {
    if (!/^\/[^/\\]/.test(url)) return undefined;
    return url.replace(/["'<>]/g, (ch) => encodeURIComponent(ch));
  }
}

const REDACTED = "[REDACTED]" as const;

export function redactPayload(
  payload: Record<string, unknown>,
  redactFields: readonly string[],
): Record<string, unknown> {
  if (redactFields.length === 0) return payload;
  const result = { ...payload };
  for (const field of redactFields) {
    if (field in result) {
      result[field] = REDACTED;
    }
  }
  return result;
}
