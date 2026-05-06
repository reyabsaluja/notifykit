import type {
  EmailChannelConfig,
  InboxChannelConfig,
  SmsChannelConfig,
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
  /** When true, template variables in `body` are HTML-escaped. Defaults to true. */
  html?: boolean;
};

export type WebhookChannelInput = {
  url: string;
  headers?: Record<string, string>;
};

export type SmsChannelInput = {
  body: string;
};

export type InboxChannelFactory = (input: InboxChannelInput) => InboxChannelConfig;
export type EmailChannelFactory = (input: EmailChannelInput) => EmailChannelConfig;
export type WebhookChannelFactory = (input: WebhookChannelInput) => WebhookChannelConfig;
export type SmsChannelFactory = (input: SmsChannelInput) => SmsChannelConfig;

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
    html: input.html ?? true,
  });
}

function webhookFactory(): WebhookChannelFactory {
  return (input) => ({
    type: "webhook",
    url: input.url,
    headers: input.headers,
  });
}

function smsFactory(): SmsChannelFactory {
  return (input) => ({
    type: "sms",
    body: input.body,
  });
}

export const channel = {
  inbox: inboxFactory,
  email: emailFactory,
  webhook: webhookFactory,
  sms: smsFactory,
};
