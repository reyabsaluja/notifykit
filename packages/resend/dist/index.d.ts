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
/**
 * Send email via Resend's REST API. The body argument is treated as plain
 * text; if you need HTML rendering, pre-render before calling send() or
 * wrap this provider to set `html` instead of `text`.
 */
export declare function resendProvider(options: ResendProviderOptions): EmailProvider;
//# sourceMappingURL=index.d.ts.map