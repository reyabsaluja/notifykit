import type { EmailChannelConfig, InboxChannelConfig } from "./types.js";
export type InboxChannelInput = {
    title: string;
    body?: string;
    actionUrl?: string;
};
export type EmailChannelInput = {
    subject: string;
    body: string;
};
export type InboxChannelFactory = (input: InboxChannelInput) => InboxChannelConfig;
export type EmailChannelFactory = (input: EmailChannelInput) => EmailChannelConfig;
declare function inboxFactory(): InboxChannelFactory;
declare function emailFactory(): EmailChannelFactory;
export declare const channel: {
    inbox: typeof inboxFactory;
    email: typeof emailFactory;
};
export {};
//# sourceMappingURL=channel.d.ts.map