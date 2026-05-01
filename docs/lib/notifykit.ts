import {
  channel,
  createNotifyKit,
  fakeEmailProvider,
  memoryAdapter,
  notification,
} from "notifykit";

const inbox = channel.inbox();
const email = channel.email();

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
      body: "Open {{postUrl}} to reply.\n\n---\nUnsubscribe: {{_unsubscribeUrl}}",
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
  unsubscribe: process.env.NOTIFYKIT_SECRET
    ? {
        secret: process.env.NOTIFYKIT_SECRET,
        baseUrl:
          process.env.NOTIFYKIT_BASE_URL ?? "http://localhost:3001/api/notifykit",
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
