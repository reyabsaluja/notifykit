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
//# sourceMappingURL=providers.js.map