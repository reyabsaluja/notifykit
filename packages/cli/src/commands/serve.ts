import {
  createHandler,
  createNotifyKit,
  fakeEmailProvider,
  memoryAdapter,
} from "notifykit";
import { loadConfig } from "../config.js";

export type ServeOptions = {
  cwd: string;
  config?: string;
  port: number;
  devUser: string;
  basePath?: string;
};

export async function runServe(options: ServeOptions): Promise<number> {
  const { config, path } = await loadConfig(options.cwd, options.config);
  console.log(`Loaded config: ${path}`);

  const notify = createNotifyKit({
    notifications: config.notifications,
    database: memoryAdapter(),
    providers: {
      email: config.providers?.email ?? fakeEmailProvider(),
    },
    on: {
      "notification.created": ({ notification }) => {
        console.log(
          `[event] notification.created  ${notification.notificationId} → ${notification.recipientId}`,
        );
      },
      "inbox.created": ({ inboxItem }) => {
        console.log(`[event] inbox.created  "${inboxItem.title}"`);
      },
      "delivery.sent": ({ delivery }) => {
        console.log(
          `[event] delivery.sent  ${delivery.to} via ${delivery.provider}`,
        );
      },
      "delivery.failed": ({ delivery, error }) => {
        console.log(
          `[event] delivery.failed  ${delivery.to}: ${error.message}`,
        );
      },
    },
  });

  await notify.upsertRecipient({
    id: options.devUser,
    email: `${options.devUser}@dev.local`,
    name: options.devUser,
  });

  const handler = createHandler(notify, {
    identify: (req) => req.headers.get("x-user-id") ?? options.devUser,
    basePath: options.basePath,
  });

  const basePath = options.basePath ?? "/api/notifykit";
  const server = Bun.serve({
    port: options.port,
    fetch: handler,
  });

  console.log(`\nNotifyKit dev server: http://localhost:${server.port}${basePath}`);
  console.log(`Dev recipient: "${options.devUser}" (override via x-user-id header)`);
  console.log(`Routes:`);
  console.log(`  GET  ${basePath}/notifications`);
  console.log(`  GET  ${basePath}/inbox`);
  console.log(`  POST ${basePath}/inbox/:id/read`);
  console.log(`  GET  ${basePath}/preferences`);
  console.log(`  POST ${basePath}/preferences`);
  console.log(`\nPress Ctrl-C to stop.`);

  return await new Promise<number>((resolve) => {
    const onSignal = () => {
      server.stop();
      resolve(0);
    };
    process.on("SIGINT", onSignal);
    process.on("SIGTERM", onSignal);
  });
}
