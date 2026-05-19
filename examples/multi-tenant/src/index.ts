import {
  channel,
  createNotifyKit,
  fakeEmailProvider,
  memoryAdapter,
  notification,
} from "@notifykitjs/core";

const inbox = channel.inbox();
const email = channel.email();

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
      body: '{{assignerName}} assigned you "{{taskTitle}}". Open {{taskUrl}} to view it.',
    }),
  ],
  category: "tasks",
});

const weeklyReport = notification({
  id: "weekly_report",
  payload: {
    reportUrl: "string",
    weekOf: "string",
  },
  channels: [
    inbox({
      title: "Weekly report ready",
      body: "Week of {{weekOf}}",
      actionUrl: "{{reportUrl}}",
    }),
    email({
      subject: "Your weekly report — {{weekOf}}",
      body: "Your weekly report is ready. View it at {{reportUrl}}.",
    }),
  ],
  category: "reports",
});

const provider = fakeEmailProvider();

const notify = createNotifyKit({
  notifications: [taskAssigned, weeklyReport] as const,
  database: memoryAdapter(),
  providers: { email: provider },
  defaults: {
    channels: { inbox: true, email: true },
  },
  tenantDefaults: (tenantId) => {
    // Tenant "acme" disables email by default (they prefer Slack)
    if (tenantId === "acme") return { email: false };
    // Tenant "bigcorp" enables all channels
    return { inbox: true, email: true };
  },
  on: {
    "notification.created": ({ notification }) => {
      console.log(`  [created] ${notification.notificationId} (tenant: ${notification.tenantId ?? "none"})`);
    },
    "delivery.sent": ({ delivery }) => {
      console.log(`  [delivered] ${delivery.channel} → ${delivery.to}`);
    },
  },
});

async function main() {
  // Two tenants, two users
  await notify.upsertRecipient({ id: "alice", email: "alice@acme.com", name: "Alice", tenantId: "acme" });
  await notify.upsertRecipient({ id: "bob", email: "bob@bigcorp.com", name: "Bob", tenantId: "bigcorp" });

  console.log("=== Tenant isolation demo ===\n");

  // Send to Alice (acme tenant — email disabled by tenant defaults)
  console.log("Sending task_assigned to Alice (tenant: acme):");
  try {
    const r1 = await notify.send({
      recipientId: "alice",
      notificationId: "task_assigned",
      tenantId: "acme",
      payload: {
        assignerName: "Carol",
        taskTitle: "Update landing page",
        taskUrl: "/tasks/1",
      },
    });
    console.log(`  skipped: ${r1.skippedChannels.join(", ") || "(none)"}\n`);
  } catch (err) {
    console.error("  send failed:", err instanceof Error ? err.message : err);
  }

  // Send to Bob (bigcorp tenant — all channels enabled)
  console.log("Sending task_assigned to Bob (tenant: bigcorp):");
  try {
    const r2 = await notify.send({
      recipientId: "bob",
      notificationId: "task_assigned",
      tenantId: "bigcorp",
      payload: {
        assignerName: "Dave",
        taskTitle: "Review Q2 budget",
        taskUrl: "/tasks/2",
      },
    });
    console.log(`  skipped: ${r2.skippedChannels.join(", ") || "(none)"}\n`);
  } catch (err) {
    console.error("  send failed:", err instanceof Error ? err.message : err);
  }

  // --- Scoped inbox queries ---
  console.log("=== Scoped inbox queries ===\n");

  // Each tenant only sees their own items
  const acmeInbox = await notify.inbox.list("alice", { tenantId: "acme" });
  const bigcorpInbox = await notify.inbox.list("bob", { tenantId: "bigcorp" });
  console.log(`Acme inbox (Alice): ${acmeInbox.length} item(s)`);
  console.log(`BigCorp inbox (Bob): ${bigcorpInbox.length} item(s)`);

  // --- Scoped preferences ---
  console.log("\n=== Scoped preferences ===\n");

  // Bob opts out of email for reports in his tenant
  await notify.preferences.update({
    recipientId: "bob",
    notificationId: "weekly_report",
    channels: { email: false },
    tenantId: "bigcorp",
  });

  console.log("Sending weekly_report to Bob (email opted-out per preference):");
  try {
    const r3 = await notify.send({
      recipientId: "bob",
      notificationId: "weekly_report",
      tenantId: "bigcorp",
      payload: {
        reportUrl: "/reports/2024-w20",
        weekOf: "May 13, 2024",
      },
    });
    console.log(`  skipped: ${r3.skippedChannels.join(", ") || "(none)"}`);
  } catch (err) {
    console.error("  send failed:", err instanceof Error ? err.message : err);
  }

  // --- Preference explain ---
  console.log("\n=== Preference resolution explain ===\n");
  const explanation = await notify.preferences.explain({
    recipientId: "bob",
    notificationId: "weekly_report",
    tenantId: "bigcorp",
  });
  console.log("Why is email off for Bob's weekly_report?");
  console.log(explanation);

  console.log(`\nTotal emails sent: ${provider.sent.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
