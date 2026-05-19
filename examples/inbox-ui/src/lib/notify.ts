import {
  channel,
  createNotifyKit,
  fakeEmailProvider,
  memoryAdapter,
  notification,
} from "@notifykitjs/core";

const inbox = channel.inbox();
const email = channel.email();

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
  ],
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
  ],
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
});

export const notify = createNotifyKit({
  notifications: [commentMentioned, taskAssigned, invoicePaid] as const,
  database: memoryAdapter(),
  providers: { email: fakeEmailProvider() },
});
