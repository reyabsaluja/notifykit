import { randomBytes } from "node:crypto";
import type { PayloadSchema } from "./types.js";

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

export class NotifyKitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotifyKitError";
  }
}

export class PayloadValidationError extends NotifyKitError {
  constructor(message: string) {
    super(message);
    this.name = "PayloadValidationError";
  }
}

export function validatePayload(
  schema: PayloadSchema,
  payload: unknown,
  notificationId: string,
): Record<string, unknown> {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    throw new PayloadValidationError(
      `Invalid payload for notification "${notificationId}": expected an object.`,
    );
  }

  const data = payload as Record<string, unknown>;
  const result: Record<string, unknown> = {};

  for (const key of Object.keys(schema)) {
    const expected = schema[key];
    const value = data[key];

    if (value === undefined) {
      throw new PayloadValidationError(
        `Invalid payload for "${notificationId}": missing "${key}" (expected ${expected}).`,
      );
    }

    const actual = typeof value;
    if (
      (expected === "string" && actual !== "string") ||
      (expected === "number" && (actual !== "number" || Number.isNaN(value))) ||
      (expected === "boolean" && actual !== "boolean")
    ) {
      throw new PayloadValidationError(
        `Invalid payload for "${notificationId}": expected "${key}" to be ${expected}, got ${actual}.`,
      );
    }

    result[key] = value;
  }

  return result;
}

const BLOCKED_HOSTNAME_PATTERNS = [
  /^localhost$/i,
  /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,
  /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,
  /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/,
  /^192\.168\.\d{1,3}\.\d{1,3}$/,
  /^169\.254\.\d{1,3}\.\d{1,3}$/,
  /^0\.0\.0\.0$/,
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

function isBlockedHostname(hostname: string): boolean {
  const clean = hostname.replace(/^\[|\]$/g, "");
  if (isNumericIp(clean)) return true;
  for (const pattern of BLOCKED_HOSTNAME_PATTERNS) {
    if (pattern.test(clean)) return true;
  }
  return false;
}

export type SafeWebhookResult = {
  pinnedUrl: string;
  hostHeader: string;
};

export async function assertSafeWebhookUrl(url: string): Promise<SafeWebhookResult> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new NotifyKitError(`Invalid webhook URL: ${url}`);
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new NotifyKitError(`Webhook URL must use http or https: ${url}`);
  }
  if (isBlockedHostname(parsed.hostname)) {
    throw new NotifyKitError(
      `Webhook URL points to a blocked address: ${url}`,
    );
  }
  const originalHost = parsed.host;
  if (typeof globalThis.process !== "undefined") {
    try {
      const dns = await import("node:dns");
      const resolve4 = dns.promises?.resolve4 ?? dns.resolve4;
      const resolve6 = dns.promises?.resolve6 ?? dns.resolve6;
      const allAddresses: string[] = [];
      const [v4, v6] = await Promise.allSettled([
        (resolve4 as (h: string) => Promise<string[]>)(parsed.hostname),
        (resolve6 as (h: string) => Promise<string[]>)(parsed.hostname),
      ]);
      if (v4.status === "fulfilled") allAddresses.push(...v4.value);
      if (v6.status === "fulfilled") allAddresses.push(...v6.value);
      if (allAddresses.length === 0) {
        throw new NotifyKitError(
          `Webhook URL failed DNS resolution: ${url}`,
        );
      }
      for (const addr of allAddresses) {
        if (isBlockedHostname(addr)) {
          throw new NotifyKitError(
            `Webhook URL resolves to a blocked address: ${url}`,
          );
        }
      }
      const pinnedIp = allAddresses[0]!;
      const pinnedHost = pinnedIp.includes(":") ? `[${pinnedIp}]` : pinnedIp;
      const port = parsed.port ? `:${parsed.port}` : "";
      parsed.hostname = pinnedHost;
      return { pinnedUrl: parsed.toString(), hostHeader: originalHost + port };
    } catch (err) {
      if (err instanceof NotifyKitError) throw err;
      throw new NotifyKitError(
        `Webhook URL failed DNS resolution: ${url}`,
      );
    }
  }
  return { pinnedUrl: url, hostHeader: originalHost };
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
