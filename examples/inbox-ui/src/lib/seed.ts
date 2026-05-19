import { notify } from "./notify";

export async function seed() {
  await notify.upsertRecipient({
    id: "user_1",
    email: "jane@example.com",
    name: "Jane",
  });

  await notify.send({
    recipientId: "user_1",
    notificationId: "comment_mentioned",
    payload: {
      actorName: "Alice",
      postTitle: "Q2 Launch Plan",
      postUrl: "/posts/1",
    },
  });

  await notify.send({
    recipientId: "user_1",
    notificationId: "task_assigned",
    payload: {
      assignerName: "Bob",
      taskTitle: "Review pull request #42",
      taskUrl: "/tasks/42",
    },
  });

  await notify.send({
    recipientId: "user_1",
    notificationId: "invoice_paid",
    payload: {
      amount: "$129.00",
      invoiceUrl: "/invoices/INV-007",
    },
  });

  await notify.send({
    recipientId: "user_1",
    notificationId: "comment_mentioned",
    payload: {
      actorName: "Charlie",
      postTitle: "Design system updates",
      postUrl: "/posts/2",
    },
  });

  await notify.send({
    recipientId: "user_1",
    notificationId: "task_assigned",
    payload: {
      assignerName: "Diana",
      taskTitle: "Ship onboarding flow",
      taskUrl: "/tasks/99",
    },
  });
}
