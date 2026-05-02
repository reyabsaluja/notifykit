import { createHmac, timingSafeEqual } from "node:crypto";
import { createId } from "./utils.js";
export function fakeEmailProvider(options = {}) {
    const sent = [];
    let failOnNext = options.failOnNext ?? false;
    return {
        id: "fake",
        sent,
        setFailOnNext(value) {
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
export function webhookProvider(options = {}) {
    const timeoutMs = options.timeoutMs ?? 10_000;
    const fetchImpl = options.fetch ?? globalThis.fetch;
    if (!fetchImpl) {
        throw new Error("webhookProvider: no fetch implementation available. Pass `fetch` in options.");
    }
    return {
        id: "webhook",
        async send(input) {
            const body = JSON.stringify(input.payload);
            const headers = {
                "content-type": "application/json",
                "user-agent": "notifykit/0.x",
                ...input.headers,
            };
            if (options.secret) {
                headers["x-notifykit-signature"] = `sha256=${createHmac("sha256", options.secret)
                    .update(body)
                    .digest("hex")}`;
            }
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), timeoutMs);
            let res;
            try {
                res = await fetchImpl(input.url, {
                    method: "POST",
                    headers,
                    body,
                    signal: controller.signal,
                });
            }
            finally {
                clearTimeout(timer);
            }
            if (!res.ok) {
                throw new Error(`Webhook ${input.url} returned HTTP ${res.status} ${res.statusText}`);
            }
            const providerMessageId = res.headers.get("x-request-id") ?? res.headers.get("request-id") ?? undefined;
            return providerMessageId ? { providerMessageId } : {};
        },
    };
}
export function fakeWebhookProvider(options = {}) {
    const sent = [];
    let failOnNext = options.failOnNext ?? false;
    return {
        id: "fake-webhook",
        sent,
        setFailOnNext(value) {
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
/**
 * Verify the HMAC-SHA256 signature on an incoming webhook request body.
 *
 * Use this in your webhook ingestion endpoint to confirm that a request
 * was actually sent by NotifyKit (or anyone holding the shared secret).
 *
 * @returns `true` if the signature is present and valid; `false` otherwise.
 */
export function verifyWebhookSignature(body, signatureHeader, secret) {
    if (!signatureHeader)
        return false;
    const prefix = "sha256=";
    if (!signatureHeader.startsWith(prefix))
        return false;
    const expected = createHmac("sha256", secret).update(body).digest("hex");
    const received = signatureHeader.slice(prefix.length);
    if (received.length !== expected.length)
        return false;
    if (!/^[0-9a-f]+$/.test(received))
        return false;
    return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(received, "hex"));
}
//# sourceMappingURL=providers.js.map