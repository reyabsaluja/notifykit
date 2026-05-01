import type {
  NotificationDefinition,
  PayloadSchema,
} from "notifykit";

export type ValidationIssue = {
  notificationId: string;
  channel: string;
  field: string;
  message: string;
};

const TEMPLATE_RE = /\{\{\s*([\w.$]+)\s*\}\}/g;

export function validateNotifications(
  notifications: readonly NotificationDefinition<string, PayloadSchema>[],
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const seenIds = new Set<string>();

  for (const def of notifications) {
    if (seenIds.has(def.id)) {
      issues.push({
        notificationId: def.id,
        channel: "-",
        field: "id",
        message: `Duplicate notification id "${def.id}".`,
      });
      continue;
    }
    seenIds.add(def.id);

    // `_unsubscribeUrl` is injected by the engine at render time for email
    // templates. It's valid to reference it even though it's not declared in
    // the payload schema.
    const payloadKeys = new Set([...Object.keys(def.payload), "_unsubscribeUrl"]);

    for (const [i, ch] of def.channels.entries()) {
      const label = `${ch.type}[${i}]`;
      if (ch.type === "inbox") {
        collectIssues(def, label, "title", ch.title, payloadKeys, issues);
        if (ch.body !== undefined) {
          collectIssues(def, label, "body", ch.body, payloadKeys, issues);
        }
        if (ch.actionUrl !== undefined) {
          collectIssues(
            def,
            label,
            "actionUrl",
            ch.actionUrl,
            payloadKeys,
            issues,
          );
        }
      } else if (ch.type === "email") {
        collectIssues(def, label, "subject", ch.subject, payloadKeys, issues);
        collectIssues(def, label, "body", ch.body, payloadKeys, issues);
      } else if (ch.type === "webhook") {
        collectIssues(def, label, "url", ch.url, payloadKeys, issues);
        if (ch.headers) {
          for (const [hk, hv] of Object.entries(ch.headers)) {
            collectIssues(
              def,
              label,
              `headers.${hk}`,
              hv,
              payloadKeys,
              issues,
            );
          }
        }
      }
    }
  }
  return issues;
}

function collectIssues(
  def: NotificationDefinition<string, PayloadSchema>,
  channel: string,
  field: string,
  template: string,
  payloadKeys: Set<string>,
  out: ValidationIssue[],
): void {
  TEMPLATE_RE.lastIndex = 0;
  const referenced = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = TEMPLATE_RE.exec(template)) !== null) {
    const key = match[1];
    if (key) referenced.add(key);
  }
  for (const key of referenced) {
    if (!payloadKeys.has(key)) {
      out.push({
        notificationId: def.id,
        channel,
        field,
        message: `Template references "{{${key}}}" but payload has no "${key}" field.`,
      });
    }
  }
}
