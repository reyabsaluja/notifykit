import type { EmailProvider } from "./types.js";
import { createId } from "./utils.js";

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

export function fakeEmailProvider(
  options: FakeEmailProviderOptions = {},
): FakeEmailProvider {
  const sent: SentEmail[] = [];
  let failOnNext = options.failOnNext ?? false;

  return {
    id: "fake",
    sent,
    setFailOnNext(value: boolean) {
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
