import { createHmac, timingSafeEqual } from "node:crypto";

export type UnsubscribeTokenClaims = {
  recipientId: string;
  tenantId?: string;
  workspaceId?: string;
  notificationId: string;
};

/**
 * Sign a compact URL-safe token binding a recipient + notification pair.
 * Format: `<base64url(payload)>.<base64url(hmac)>`. No expiry — RFC 8058
 * unsubscribe links must keep working indefinitely. An epoch field (default 1)
 * is embedded so secret rotation can invalidate specific batches.
 */
export function signUnsubscribeToken(
  claims: UnsubscribeTokenClaims,
  secret: string,
  epoch: number = 1,
): string {
  const payload = [
    claims.recipientId,
    claims.notificationId,
    claims.tenantId ?? "",
    claims.workspaceId ?? "",
    String(epoch),
  ]
    .map(encode)
    .join(":");
  const signature = hmac(payload, secret);
  return `${toBase64Url(Buffer.from(payload))}.${signature}`;
}

/**
 * Verify and decode a token. Returns the claims on success, `null` on any
 * form of failure — never throws. Uses a timing-safe comparison.
 *
 * Accepts a single secret or an array of secrets to support rotation.
 * When an array is provided, each secret is tried in order.
 */
export function verifyUnsubscribeToken(
  token: string,
  secret: string | string[],
): UnsubscribeTokenClaims | null {
  const secrets = Array.isArray(secret) ? secret : [secret];
  if (typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payloadB64, sigB64] = parts;
  if (!payloadB64 || !sigB64) return null;

  let payload: string;
  try {
    payload = Buffer.from(payloadB64, "base64url").toString("utf8");
  } catch {
    return null;
  }

  let matched = false;
  for (const s of secrets) {
    const expected = hmac(payload, s);
    const a = Buffer.from(sigB64);
    const b = Buffer.from(expected);
    if (a.length === b.length && timingSafeEqual(a, b)) {
      matched = true;
      break;
    }
  }
  if (!matched) return null;

  const segments = payload.split(":");
  if (segments.length !== 4 && segments.length !== 5) return null;
  const [encRecipient, encNotification, encTenant, encWorkspace] = segments;
  if (!encRecipient || !encNotification) return null;

  try {
    const claims: UnsubscribeTokenClaims = {
      recipientId: decode(encRecipient),
      notificationId: decode(encNotification),
    };
    if (encTenant) claims.tenantId = decode(encTenant);
    if (encWorkspace) claims.workspaceId = decode(encWorkspace);
    return claims;
  } catch {
    return null;
  }
}

function hmac(data: string, secret: string): string {
  return createHmac("sha256", secret).update(data).digest("base64url");
}

/** URL-safe encode a single segment; preserves lookups by using `:` as separator. */
function encode(s: string): string {
  return encodeURIComponent(s);
}

function decode(s: string): string {
  return decodeURIComponent(s);
}

function toBase64Url(buf: Buffer): string {
  return buf.toString("base64url");
}
