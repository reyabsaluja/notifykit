/**
 * Send email via Resend's REST API. The body argument is treated as plain
 * text; if you need HTML rendering, pre-render before calling send() or
 * wrap this provider to set `html` instead of `text`.
 */
export function resendProvider(options) {
    if (!options.apiKey) {
        throw new Error("resendProvider: `apiKey` is required.");
    }
    if (!options.from) {
        throw new Error("resendProvider: `from` is required.");
    }
    const baseUrl = (options.baseUrl ?? "https://api.resend.com").replace(/\/+$/, "");
    const timeoutMs = options.timeoutMs ?? 10_000;
    const fetchImpl = options.fetch ?? globalThis.fetch;
    if (!fetchImpl) {
        throw new Error("resendProvider: no fetch implementation available. Pass `fetch` in options.");
    }
    return {
        id: "resend",
        async send(input) {
            const body = {
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
            let res;
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
            }
            finally {
                clearTimeout(timer);
            }
            const json = (await res.json().catch(() => null));
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
//# sourceMappingURL=index.js.map