import { createHandler, createNotifyKit, fakeEmailProvider, fakeWebhookProvider, memoryAdapter, } from "notifykit";
import { loadConfig } from "../config.js";
export async function runServe(options) {
    const { config, path } = await loadConfig(options.cwd, options.config);
    console.log(`Loaded config: ${path}`);
    const notify = createNotifyKit({
        notifications: config.notifications,
        database: memoryAdapter(),
        providers: {
            email: config.providers?.email ?? fakeEmailProvider(),
            webhook: fakeWebhookProvider(),
        },
        on: {
            "notification.created": ({ notification }) => {
                console.log(`[event] notification.created  ${notification.notificationId} → ${notification.recipientId}`);
            },
            "inbox.created": ({ inboxItem }) => {
                console.log(`[event] inbox.created  "${inboxItem.title}"`);
            },
            "delivery.sent": ({ delivery }) => {
                console.log(`[event] delivery.sent  ${delivery.channel} via ${delivery.provider} (${delivery.recipientId})`);
            },
            "delivery.failed": ({ delivery, error }) => {
                console.log(`[event] delivery.failed  ${delivery.channel} via ${delivery.provider} (${delivery.recipientId}): ${error.message}`);
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
    const server = Bun.serve({
        port: options.port,
        fetch: handler,
    });
    console.log(`\nNotifyKit dev server: http://localhost:${server.port}${basePath}`);
    console.log(`⚠ Dev-only auth: identity comes from x-user-id header. Do NOT use this in production.`);
    console.log(`Dev recipient: "${options.devUser}" (override via x-user-id header)`);
    console.log(`Routes:`);
    console.log(`  GET  ${basePath}/notifications`);
    console.log(`  GET  ${basePath}/inbox`);
    console.log(`  POST ${basePath}/inbox/:id/read`);
    console.log(`  GET  ${basePath}/preferences`);
    console.log(`  POST ${basePath}/preferences`);
    console.log(`\nPress Ctrl-C to stop.`);
    return await new Promise((resolve) => {
        const onSignal = () => {
            server.stop();
            resolve(0);
        };
        process.on("SIGINT", onSignal);
        process.on("SIGTERM", onSignal);
    });
}
//# sourceMappingURL=serve.js.map