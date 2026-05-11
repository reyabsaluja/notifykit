import {
  channel,
  createNotifyKit,
  fakeEmailProvider,
  memoryAdapter,
  notification,
} from "@notifykitjs/core";

const inbox = channel.inbox();
const email = channel.email();
const unsubscribeSecret = process.env.NOTIFYKIT_SECRET;
const unsubscribeBaseUrl =
  process.env.NOTIFYKIT_BASE_URL ?? "http://localhost:3001/api/notifykit";
const commentMentionedEmailBody = unsubscribeSecret
  ? "Open {{postUrl}} to reply.\n\n---\nUnsubscribe: {{_unsubscribeUrl}}"
  : "Open {{postUrl}} to reply.";

export const commentMentioned = notification({
  id: "comment_mentioned",
  payload: {
    actorName: "string",
    postTitle: "string",
    postUrl: "string",
  },
  channels: [
    inbox({
      title: "{{actorName}} mentioned you",
      body: "In {{postTitle}}",
      actionUrl: "{{postUrl}}",
    }),
    email({
      subject: "{{actorName}} mentioned you in {{postTitle}}",
      body: commentMentionedEmailBody,
    }),
  ],
});

export const welcomeNotification = notification({
  id: "welcome",
  payload: { name: "string" },
  channels: [inbox({ title: "Welcome, {{name}}" })],
});

// Single in-memory instance for the docs site. Each browser gets its own
// recipient id (see lib/session.ts) so demo users don't see each other.
export const notify = createNotifyKit({
  notifications: [commentMentioned, welcomeNotification] as const,
  database: memoryAdapter(),
  providers: { email: fakeEmailProvider() },
  unsubscribe: unsubscribeSecret
    ? {
        secret: unsubscribeSecret,
        baseUrl: unsubscribeBaseUrl,
      }
    : undefined,
});

export async function ensureRecipient(id: string): Promise<void> {
  await notify.upsertRecipient({
    id,
    email: `${id}@demo.local`,
    name: "Demo Visitor",
  });
}
