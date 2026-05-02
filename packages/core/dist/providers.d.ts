import type { EmailProvider, WebhookProvider } from "./types.js";
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
export declare function fakeEmailProvider(options?: FakeEmailProviderOptions): FakeEmailProvider;
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
export declare function webhookProvider(options?: WebhookProviderOptions): WebhookProvider;
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
export declare function fakeWebhookProvider(options?: FakeWebhookProviderOptions): FakeWebhookProvider;
/**
 * Verify the HMAC-SHA256 signature on an incoming webhook request body.
 *
 * Use this in your webhook ingestion endpoint to confirm that a request
 * was actually sent by NotifyKit (or anyone holding the shared secret).
 *
 * @returns `true` if the signature is present and valid; `false` otherwise.
 */
export declare function verifyWebhookSignature(body: string, signatureHeader: string | null | undefined, secret: string): boolean;
//# sourceMappingURL=providers.d.ts.map