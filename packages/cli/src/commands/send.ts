import {
  createNotifyKit,
  fakeEmailProvider,
  memoryAdapter,
} from "notifykit";
import { loadConfig } from "../config.js";

export type SendOptions = {
  cwd: string;
  config?: string;
  notificationId: string;
  recipientId: string;
  payload: Record<string, unknown>;
  recipientEmail?: string;
};

export async function runSend(options: SendOptions): Promise<number> {
  const { config } = await loadConfig(options.cwd, options.config);

  const notify = createNotifyKit({
    notifications: config.notifications,
    database: memoryAdapter(),
    providers: {
      email: config.providers?.email ?? fakeEmailProvider(),
    },
  });

  await notify.upsertRecipient({
    id: options.recipientId,
    email: options.recipientEmail,
    name: options.recipientId,
  });

  const result = await notify.send({
    recipientId: options.recipientId,
    notificationId: options.notificationId,
    payload: options.payload,
  } as Parameters<typeof notify.send>[0]);

  console.log(`Sent "${options.notificationId}" to ${options.recipientId}`);
  console.log(`Notification record: ${result.notification.id}`);
  if (result.inboxItems.length > 0) {
    for (const item of result.inboxItems) {
      console.log(`  inbox: "${item.title}"`);
    }
  }
  for (const delivery of result.deliveries) {
    console.log(`  ${delivery.channel}: ${delivery.status} → ${delivery.to}`);
    if (delivery.error) {
      console.log(`    error: ${delivery.error}`);
    }
  }
  if (result.skippedChannels.length > 0) {
    console.log(`  skipped: ${result.skippedChannels.join(", ")}`);
  }
  return 0;
}
