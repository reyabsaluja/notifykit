import {
  channel,
  createNotifyKit,
  memoryAdapter,
  notification,
} from "@notifykitjs/core";
import { resendProvider } from "@notifykitjs/resend";

const apiKey = process.env.RESEND_API_KEY;
if (!apiKey) {
  console.error("Missing RESEND_API_KEY environment variable.");
  console.error("Get a test key at https://resend.com/api-keys");
  process.exit(1);
}

const inbox = channel.inbox();
const email = channel.email();

const welcomeEmail = notification({
  id: "welcome",
  payload: {
    userName: "string",
    loginUrl: "string",
  },
  channels: [
    inbox({
      title: "Welcome, {{userName}}!",
      body: "Your account is ready.",
      actionUrl: "{{loginUrl}}",
    }),
    email({
      subject: "Welcome to Acme, {{userName}}!",
      body: `<h1>Hey {{userName}}</h1>
<p>Your account is ready. <a href="{{loginUrl}}">Sign in</a> to get started.</p>`,
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
      body: `<p>We received your payment of <strong>{{amount}}</strong>.</p>
<p><a href="{{invoiceUrl}}">View invoice</a></p>`,
    }),
  ],
});

const notify = createNotifyKit({
  notifications: [welcomeEmail, invoicePaid] as const,
  database: memoryAdapter(),
  providers: {
    email: resendProvider({
      apiKey,
      from: "Acme <onboarding@resend.dev>",
    }),
  },
  on: {
    "delivery.sent": ({ delivery }) => {
      console.log(`[delivered] ${delivery.channel} → ${delivery.to} (provider ID: ${delivery.providerMessageId})`);
    },
    "delivery.failed": ({ delivery, error }) => {
      console.error(`[failed] ${delivery.channel} → ${delivery.to}: ${error.message}`);
    },
  },
});

async function main() {
  const recipientEmail = process.env.TEST_EMAIL ?? "delivered@resend.dev";

  await notify.upsertRecipient({
    id: "user_1",
    email: recipientEmail,
    name: "Test User",
  });

  console.log(`Sending welcome email to ${recipientEmail}...`);
  const result = await notify.send({
    recipientId: "user_1",
    notificationId: "welcome",
    payload: {
      userName: "Test User",
      loginUrl: "https://app.example.com/login",
    },
  });

  console.log(`\nSendResult:`);
  console.log(`  Inbox items: ${result.inboxItems.length}`);
  console.log(`  Deliveries:  ${result.deliveries.length}`);
  console.log(`  Skipped:     ${result.skippedChannels.length > 0 ? result.skippedChannels.join(", ") : "(none)"}`);

  console.log(`\nSending invoice_paid email...`);
  const result2 = await notify.send({
    recipientId: "user_1",
    notificationId: "invoice_paid",
    payload: {
      amount: "$49.00",
      invoiceUrl: "https://app.example.com/invoices/INV-001",
    },
  });

  console.log(`  Deliveries: ${result2.deliveries.length}`);
  console.log(`\nDone. Check your inbox at ${recipientEmail}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
