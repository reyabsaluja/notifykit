import type { EmailProvider } from "./types.js";
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
//# sourceMappingURL=providers.d.ts.map