import {
  channel,
  createNotifyKit,
  fakeEmailProvider,
  memoryAdapter,
  notification,
} from "@notifykitjs/core";

// ---------------------------------------------------------------------------
// Define your notifications in code.
// ---------------------------------------------------------------------------

const secret = process.env.NOTIFYKIT_SECRET;
const baseUrl = process.env.NOTIFYKIT_BASE_URL;

if (secret === "replace-me-with-a-32-byte-random-secret") {
  throw new Error(
    "NOTIFYKIT_SECRET is still the placeholder value from .env.example. " +
    "Generate a real secret: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
  );
}

const unsubscribe =
  secret && baseUrl
    ? { secret, baseUrl }
    : undefined;
const unsubscribeFooter = unsubscribe
  ? "\n---\nDon't want these? {{_unsubscribeUrl}}\n"
  : "";

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
      body: `Hey,

{{actorName}} mentioned you in "{{postTitle}}".

Open {{postUrl}} to reply.
${unsubscribeFooter}`,
    }),
  ],
});

// ---------------------------------------------------------------------------
// Create the NotifyKit instance. This is the object your app uses to send
// notifications and to back the handler / React hooks.
//
// Defaults below are zero-config: memory adapter + fake email provider. Flip
// to real providers when you're ready:
//
//   import { drizzleSqliteAdapter, createSqliteTables } from "@notifykitjs/drizzle"
//   import Database from "better-sqlite3"
//   import { drizzle } from "drizzle-orm/better-sqlite3"
//   const db = drizzle(new Database("app.db"))
//   await createSqliteTables(db)
//   database: drizzleSqliteAdapter(db),
//
//   import { resendProvider } from "@notifykitjs/resend"
//   providers: { email: resendProvider({ apiKey: process.env.RESEND_API_KEY!, from: process.env.RESEND_FROM! }) }
// ---------------------------------------------------------------------------

export const notify = createNotifyKit({
  notifications: [commentMentioned] as const,
  database: memoryAdapter(),
  providers: {
    email: fakeEmailProvider(),
  },
  unsubscribe,
});

// Seed a demo recipient so the starter "just works" without a signup flow.
// Replace this with your real user-creation hook.
let seedPromise: Promise<void> | undefined;
export function ensureDemoUser(): Promise<void> {
  seedPromise ??= notify
    .upsertRecipient({
      id: "demo_user",
      email: "demo@example.com",
      name: "Demo User",
    })
    .then(() => undefined)
    .catch((error) => {
      seedPromise = undefined;
      throw error;
    });
  return seedPromise;
}
