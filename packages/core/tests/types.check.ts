/**
 * Type-check-only fixture — not executed at runtime.
 * Run via: bun run typecheck
 *
 * Regression coverage for #115: exported NotifyKit instances must
 * preserve notification IDs and payload types across module boundaries.
 * Imports from dist/ to test through .d.ts — the boundary that breaks
 * without `const` on the generic parameter.
 */

import {
  channel,
  createNotifyKit,
  memoryAdapter,
  notification,
  type NotifyKit,
  type NotificationDefinition,
  type SendInput,
} from "../dist/index.js";

const inbox = channel.inbox();

// ── Setup ──

const commentMentioned = notification({
  id: "comment_mentioned",
  payload: {
    actorName: "string",
    postTitle: "string",
    postUrl: "string",
  },
  channels: [inbox({ title: "{{actorName}} mentioned you" })],
});

const welcome = notification({
  id: "welcome",
  payload: { name: "string" },
  channels: [inbox({ title: "Welcome, {{name}}" })],
});

const typed = notification({
  id: "typed",
  payload: { name: "string", count: "number" },
  channels: [inbox({ title: "{{name}}" })],
});

const defs = [commentMentioned, welcome, typed] as const;

const notify = createNotifyKit({
  notifications: defs,
  database: memoryAdapter(),
});

type SendParam = Parameters<typeof notify.send>[0];

// ── Positive: correct calls must compile ──

void notify.send({
  recipientId: "u1",
  notificationId: "comment_mentioned",
  payload: { actorName: "Alice", postTitle: "Launch Plan", postUrl: "/posts/42" },
});

void notify.send({
  recipientId: "u1",
  notificationId: "welcome",
  payload: { name: "friend" },
});

void notify.send({
  recipientId: "u1",
  notificationId: "typed",
  payload: { name: "hi", count: 1 },
});

// ── Key assertion: payload fields must resolve to concrete types, not `never` ──
// Without the `const` generic modifier, InferSchema widens S to
// Record<string, PrimitiveSchema> and every field resolves to `never`.
// These assignments prove fields are `string`, not `never`.

type CommentPayload = Extract<SendParam, { notificationId: "comment_mentioned" }>["payload"];
const _actorName: CommentPayload["actorName"] = "test";
const _checkString: string = _actorName;

// ── Negative: wrong notification ID ──

// @ts-expect-error — "nonexistent" is not a valid notification ID
const _badId: SendParam["notificationId"] = "nonexistent";

// ── Negative: missing payload field ──

type TypedPayload = Extract<SendParam, { notificationId: "typed" }>["payload"];
// @ts-expect-error — missing "count" field
const _badPayload: TypedPayload = { name: "hi" };
