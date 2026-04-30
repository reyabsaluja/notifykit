import { parseArgs } from "node:util";
import { ConfigError } from "./config.js";
import { runCheck } from "./commands/check.js";
import { runServe } from "./commands/serve.js";
import { runSend } from "./commands/send.js";
const USAGE = `
notifykit — app-native notification framework CLI

Usage:
  notifykit check  [--config <path>]
  notifykit serve  [--config <path>] [--port <n>] [--dev-user <id>] [--base-path <p>]
  notifykit send   --to <recipientId> --id <notificationId> [--payload <json>] [--email <addr>] [--config <path>]

Examples:
  notifykit check
  notifykit serve --port 4000 --dev-user me
  notifykit send --to user_1 --id comment_mentioned --payload '{"actorName":"Rey","postTitle":"Plan","postUrl":"/p"}' --email me@x.com
`.trim();
export async function run(argv) {
    const [command, ...rest] = argv;
    if (!command || command === "--help" || command === "-h") {
        console.log(USAGE);
        return 0;
    }
    try {
        switch (command) {
            case "check":
                return await handleCheck(rest);
            case "serve":
                return await handleServe(rest);
            case "send":
                return await handleSend(rest);
            default:
                console.error(`Unknown command: ${command}`);
                console.error(USAGE);
                return 1;
        }
    }
    catch (err) {
        if (err instanceof ConfigError) {
            console.error(`Config error: ${err.message}`);
            return 2;
        }
        const message = err instanceof Error ? err.message : String(err);
        console.error(`Error: ${message}`);
        return 1;
    }
}
async function handleCheck(args) {
    const { values } = parseArgs({
        args,
        options: {
            config: { type: "string" },
        },
        allowPositionals: false,
        strict: true,
    });
    return runCheck({ cwd: process.cwd(), config: values.config });
}
async function handleServe(args) {
    const { values } = parseArgs({
        args,
        options: {
            config: { type: "string" },
            port: { type: "string", default: "4000" },
            "dev-user": { type: "string", default: "dev_user" },
            "base-path": { type: "string" },
        },
        allowPositionals: false,
        strict: true,
    });
    const port = Number(values.port);
    if (!Number.isFinite(port) || port < 0 || port > 65535) {
        throw new Error(`Invalid --port: ${values.port}`);
    }
    return runServe({
        cwd: process.cwd(),
        config: values.config,
        port,
        devUser: values["dev-user"],
        basePath: values["base-path"],
    });
}
async function handleSend(args) {
    const { values } = parseArgs({
        args,
        options: {
            config: { type: "string" },
            to: { type: "string" },
            id: { type: "string" },
            payload: { type: "string", default: "{}" },
            email: { type: "string" },
        },
        allowPositionals: false,
        strict: true,
    });
    if (!values.to)
        throw new Error("--to <recipientId> is required");
    if (!values.id)
        throw new Error("--id <notificationId> is required");
    let payload;
    try {
        const raw = JSON.parse(values.payload ?? "{}");
        if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
            throw new Error("--payload must be a JSON object");
        }
        payload = raw;
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        throw new Error(`Invalid --payload JSON: ${message}`);
    }
    return runSend({
        cwd: process.cwd(),
        config: values.config,
        notificationId: values.id,
        recipientId: values.to,
        payload,
        recipientEmail: values.email,
    });
}
//# sourceMappingURL=cli.js.map