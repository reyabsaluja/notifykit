import { loadConfig } from "../config.js";
import { validateNotifications } from "../validate.js";

export type CheckOptions = {
  cwd: string;
  config?: string;
  strict?: boolean;
};

export async function runCheck(options: CheckOptions): Promise<number> {
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

  const issues = validateNotifications(config.notifications, {
    providers: config.providers,
    unsubscribe: config.unsubscribe,
    defaults: config.defaults,
  });
  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");

  if (warnings.length > 0) {
    console.warn(`\n${warnings.length} warning(s):`);
    for (const issue of warnings) {
      const loc = [issue.notificationId, issue.channel].filter(Boolean).join(" → ");
      console.warn(
        `  WARN  ${loc ? `${loc} · ` : ""}${issue.field}: ${issue.message}${issue.fix ? ` ${issue.fix}` : ""}`,
      );
    }
  }

  if (errors.length > 0) {
    console.error(`\n${errors.length} error(s):`);
    for (const issue of errors) {
      const loc = [issue.notificationId, issue.channel].filter(Boolean).join(" → ");
      console.error(
        `  ERROR ${loc ? `${loc} · ` : ""}${issue.field}: ${issue.message}${issue.fix ? ` ${issue.fix}` : ""}`,
      );
    }
    return 1;
  }

  if (options.strict && warnings.length > 0) {
    console.error(`\n--strict: ${warnings.length} warning(s) treated as errors.`);
    return 1;
  }

  console.log("\nAll notifications look good.");
  return 0;
}
