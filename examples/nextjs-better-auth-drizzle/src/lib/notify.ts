import {
  channel,
  createNotifyKit,
  fakeEmailProvider,
  notification,
} from "@notifykitjs/core";
import { drizzleSqliteAdapter } from "@notifykitjs/drizzle";
import { resendProvider } from "@notifykitjs/resend";
import { db } from "@/db";

const inbox = channel.inbox();
const email = channel.email();

const welcomeEmail = notification({
  id: "welcome",
  payload: {
    userName: "string",
  },
  channels: [
    inbox({
      title: "Welcome, {{userName}}!",
      body: "Your account is ready. Explore the app to get started.",
      actionUrl: "/",
    }),
    email({
      subject: "Welcome to Acme, {{userName}}!",
      body: "<h1>Welcome, {{userName}}!</h1><p>Your account is ready.</p>",
    }),
  ],
  category: "system",
  description: "Sent when a new user signs up",
});

const commentMentioned = notification({
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
      body: "<p><strong>{{actorName}}</strong> mentioned you in <em>{{postTitle}}</em>.</p><p><a href=\"{{postUrl}}\">View post</a></p>",
    }),
  ],
  category: "social",
  description: "When someone mentions you in a comment",
});

const taskAssigned = notification({
  id: "task_assigned",
  payload: {
    assignerName: "string",
    taskTitle: "string",
    taskUrl: "string",
  },
  channels: [
    inbox({
      title: "{{assignerName}} assigned you a task",
      body: "{{taskTitle}}",
      actionUrl: "{{taskUrl}}",
    }),
    email({
      subject: "New task: {{taskTitle}}",
      body: "<p><strong>{{assignerName}}</strong> assigned you a task: {{taskTitle}}</p><p><a href=\"{{taskUrl}}\">View task</a></p>",
    }),
  ],
  category: "tasks",
  description: "When a task is assigned to you",
});

const invoicePaid = notification({
  id: "invoice_paid",
  payload: {
    amount: "string",
    invoiceUrl: "string",
  },
  channels: [
    inbox({
      title: "Payment received: {{amount}}",
      body: "Your invoice has been paid.",
      actionUrl: "{{invoiceUrl}}",
    }),
    email({
      subject: "Payment received: {{amount}}",
      body: "<p>We received your payment of <strong>{{amount}}</strong>.</p><p><a href=\"{{invoiceUrl}}\">View invoice</a></p>",
    }),
  ],
  category: "billing",
  description: "When a payment is received",
  required: true,
});

const emailProvider = process.env.RESEND_API_KEY
  ? resendProvider({
      apiKey: process.env.RESEND_API_KEY,
      from: process.env.RESEND_FROM ?? "Acme <onboarding@resend.dev>",
    })
  : fakeEmailProvider();

export const notify = createNotifyKit({
  notifications: [welcomeEmail, commentMentioned, taskAssigned, invoicePaid] as const,
  database: drizzleSqliteAdapter(db),
  providers: { email: emailProvider },
  defaults: {
    channels: { inbox: true, email: true },
  },
  on: {
    "delivery.sent": ({ delivery }) => {
      console.log(`[notifykit] delivered ${delivery.channel} → ${delivery.to}`);
    },
    "delivery.failed": ({ delivery, error }) => {
      console.error(`[notifykit] failed ${delivery.channel} → ${delivery.to}: ${error.message}`);
    },
  },
});
