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
export declare function signUnsubscribeToken(claims: UnsubscribeTokenClaims, secret: string): string;
/**
 * Verify and decode a token. Returns the claims on success, `null` on any
 * form of failure — never throws. Uses a timing-safe comparison.
 */
export declare function verifyUnsubscribeToken(token: string, secret: string): UnsubscribeTokenClaims | null;
//# sourceMappingURL=unsubscribe.d.ts.map