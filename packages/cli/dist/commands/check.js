import { loadConfig } from "../config.js";
import { validateNotifications } from "../validate.js";
export async function runCheck(options) {
    const { config, path } = await loadConfig(options.cwd, options.config);
    console.log(`Loaded config: ${path}`);
    console.log(`Notifications: ${config.notifications.length}`);
    for (const def of config.notifications) {
        const channels = def.channels.map((c) => c.type).join(", ");
        const payload = Object.entries(def.payload)
            .map(([k, v]) => `${k}: ${v}`)
            .join(", ");
        console.log(`  - ${def.id}  channels=[${channels}]  payload={${payload}}`);
    }
    const issues = validateNotifications(config.notifications);
    if (issues.length === 0) {
        console.log("\nAll notifications look good.");
        return 0;
    }
    console.error(`\nFound ${issues.length} issue(s):`);
    for (const issue of issues) {
        console.error(`  ${issue.notificationId} · ${issue.channel}.${issue.field}: ${issue.message}`);
    }
    return 1;
}
//# sourceMappingURL=check.js.map