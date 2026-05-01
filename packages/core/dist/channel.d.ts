import type { EmailChannelConfig, InboxChannelConfig, WebhookChannelConfig } from "./types.js";
export type InboxChannelInput = {
    title: string;
    body?: string;
    actionUrl?: string;
};
export type EmailChannelInput = {
    subject: string;
    body: string;
};
export type WebhookChannelInput = {
    url: string;
    headers?: Record<string, string>;
};
export type InboxChannelFactory = (input: InboxChannelInput) => InboxChannelConfig;
export type EmailChannelFactory = (input: EmailChannelInput) => EmailChannelConfig;
export type WebhookChannelFactory = (input: WebhookChannelInput) => WebhookChannelConfig;
declare function inboxFactory(): InboxChannelFactory;
declare function emailFactory(): EmailChannelFactory;
declare function webhookFactory(): WebhookChannelFactory;
export declare const channel: {
    inbox: typeof inboxFactory;
    email: typeof emailFactory;
    webhook: typeof webhookFactory;
};
export {};
//# sourceMappingURL=channel.d.ts.map