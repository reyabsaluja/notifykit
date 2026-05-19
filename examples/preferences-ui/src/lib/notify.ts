import {
  channel,
  createNotifyKit,
  fakeEmailProvider,
  memoryAdapter,
  notification,
} from "@notifykitjs/core";

const inbox = channel.inbox();
const email = channel.email();
const sms = channel.sms();

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
      body: "Open {{postUrl}} to reply.",
    }),
    sms({ body: "{{actorName}} mentioned you in {{postTitle}}" }),
  ],
  category: "social",
  description: "When someone mentions you in a comment",
});

const newFollower = notification({
  id: "new_follower",
  payload: {
    followerName: "string",
    followerUrl: "string",
  },
  channels: [
    inbox({
      title: "{{followerName}} followed you",
      actionUrl: "{{followerUrl}}",
    }),
    email({
      subject: "{{followerName}} started following you",
      body: "{{followerName}} is now following you.",
    }),
  ],
  category: "social",
  description: "When someone follows your profile",
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
      body: "{{assignerName}} assigned you "{{taskTitle}}".",
    }),
    sms({ body: "New task from {{assignerName}}: {{taskTitle}}" }),
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
      body: "We received your payment of {{amount}}.",
    }),
  ],
  category: "billing",
  description: "When a payment is received",
  required: true,
});

const securityAlert = notification({
  id: "security_alert",
  payload: {
    event: "string",
    ipAddress: "string",
  },
  channels: [
    inbox({
      title: "Security alert: {{event}}",
      body: "From IP {{ipAddress}}",
    }),
    email({
      subject: "Security alert: {{event}}",
      body: "A security event was detected from {{ipAddress}}.",
    }),
    sms({ body: "Security alert: {{event}} from {{ipAddress}}" }),
  ],
  category: "security",
  description: "Security events like new logins or password changes",
  required: true,
});

export const notify = createNotifyKit({
  notifications: [commentMentioned, newFollower, taskAssigned, invoicePaid, securityAlert] as const,
  database: memoryAdapter(),
  providers: { email: fakeEmailProvider() },
  defaults: {
    channels: { inbox: true, email: true },
  },
});
