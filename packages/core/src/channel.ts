import type {
  EmailChannelConfig,
  InboxChannelConfig,
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

export type InboxChannelFactory = (input: InboxChannelInput) => InboxChannelConfig;
export type EmailChannelFactory = (input: EmailChannelInput) => EmailChannelConfig;

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

export const channel = {
  inbox: inboxFactory,
  email: emailFactory,
};
