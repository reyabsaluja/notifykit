import {
  createHandler,
  createNotifyKit,
  fakeEmailProvider,
  fakeWebhookProvider,
  memoryAdapter,
} from "notifykit";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
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
      webhook: config.providers?.webhook ?? fakeWebhookProvider(),
      sms: config.providers?.sms,
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
          `[event] delivery.sent  ${delivery.channel} via ${delivery.provider} (${delivery.recipientId})`,
        );
      },
      "delivery.failed": ({ delivery, error }) => {
        console.log(
          `[event] delivery.failed  ${delivery.channel} via ${delivery.provider} (${delivery.recipientId}): ${error.message}`,
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
    // DEV ONLY — trusts a raw header. Never use this pattern in production;
    // resolve identity from a verified session or JWT instead.
    identify: (req) => req.headers.get("x-user-id") ?? options.devUser,
    basePath: options.basePath,
  });

  const basePath = options.basePath ?? "/api/notifykit";
  const server = createServer(async (req, res) => {
    try {
      const request = toRequest(req, options.port);
      const response = await handler(request);
      await writeResponse(res, response);
    } catch (err) {
      res.statusCode = 500;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ error: "Internal error" }));
      console.error(
        `[notifykit:serve] ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port, "127.0.0.1", () => {
      server.removeListener("error", reject);
      resolve();
    });
  }).catch((err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      console.error(`Port ${options.port} is already in use. Try a different port with --port.`);
      process.exit(1);
    }
    throw err;
  });
  const address = server.address();
  const actualPort =
    typeof address === "object" && address ? address.port : options.port;

  console.log(`\nNotifyKit dev server: http://localhost:${actualPort}${basePath}`);
  console.log(
    `⚠ Dev-only auth: identity comes from x-user-id header. Do NOT use this in production.`,
  );
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
      server.close(() => resolve(0));
    };
    process.on("SIGINT", onSignal);
    process.on("SIGTERM", onSignal);
  });
}

function toRequest(req: IncomingMessage, port: number): Request {
  const host = req.headers.host ?? `localhost:${port}`;
  const url = new URL(req.url ?? "/", `http://${host}`);
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const item of value) headers.append(key, item);
    } else {
      headers.set(key, value);
    }
  }
  return new Request(url.toString(), {
    method: req.method ?? "GET",
    headers,
    body: req.method === "GET" || req.method === "HEAD" ? undefined : req,
    duplex: "half",
  } as RequestInit);
}

async function writeResponse(res: ServerResponse, response: Response): Promise<void> {
  res.statusCode = response.status;
  res.statusMessage = response.statusText;
  response.headers.forEach((value, key) => {
    res.setHeader(key, value);
  });
  if (!response.body) {
    res.end();
    return;
  }
  const reader = response.body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(Buffer.from(value));
    }
    res.end();
  } catch (err) {
    res.destroy(err instanceof Error ? err : new Error(String(err)));
  }
}
