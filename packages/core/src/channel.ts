import type {
  EmailChannelConfig,
  InboxChannelConfig,
  WebhookChannelConfig,
} from "./types.js";

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

function inboxFactory(): InboxChannelFactory {
  return (input) => ({
    type: "inbox",
    title: input.title,
    body: input.body,
    actionUrl: input.actionUrl,
  });
}

function emailFactory(): EmailChannelFactory {
  return (input) => ({
    type: "email",
    subject: input.subject,
    body: input.body,
  });
}

function webhookFactory(): WebhookChannelFactory {
  return (input) => ({
    type: "webhook",
    url: input.url,
    headers: input.headers,
  });
}

export const channel = {
  inbox: inboxFactory,
  email: emailFactory,
  webhook: webhookFactory,
};
