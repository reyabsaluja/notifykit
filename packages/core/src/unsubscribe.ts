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
 * unsubscribe links must keep working indefinitely.
 */
export function signUnsubscribeToken(
  claims: UnsubscribeTokenClaims,
  secret: string,
): string {
  const payload = [
    claims.recipientId,
    claims.notificationId,
    claims.tenantId ?? "",
    claims.workspaceId ?? "",
  ]
    .map(encode)
    .join(":");
  const signature = hmac(payload, secret);
  return `${toBase64Url(Buffer.from(payload))}.${signature}`;
}

/**
 * Verify and decode a token. Returns the claims on success, `null` on any
 * form of failure — never throws. Uses a timing-safe comparison.
 */
export function verifyUnsubscribeToken(
  token: string,
  secret: string,
): UnsubscribeTokenClaims | null {
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

  const expected = hmac(payload, secret);
  const a = Buffer.from(sigB64);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return null;
  if (!timingSafeEqual(a, b)) return null;

  const segments = payload.split(":");
  if (segments.length !== 4) return null;
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
