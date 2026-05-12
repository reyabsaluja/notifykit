import type {
  CategoryDefaults,
  ChannelConfig,
  ChannelPreferenceMap,
  ChannelType,
  EmailProvider,
  FallbackRule,
  InboxChannelConfig,
  NotificationDefinition,
  PayloadSchema,
  PrimitiveSchema,
  SmsProvider,
  WebhookProvider,
} from "./types.js";
import { extractTemplateVars } from "./utils.js";
import { isSyntheticPreferenceKey } from "./preference-keys.js";

export type ValidationSeverity = "error" | "warning";

export type ValidationIssue = {
  severity: ValidationSeverity;
  code: string;
  notificationId?: string;
  channel?: string;
  field: string;
  message: string;
  fix?: string;
};

export type ValidateConfigInput = {
  notifications: readonly NotificationDefinition<string, PayloadSchema>[];
  providers?: {
    email?: EmailProvider;
    webhook?: WebhookProvider;
    sms?: SmsProvider;
  };
  unsubscribe?: { secret: string; baseUrl: string };
  defaults?: {
    channels?: ChannelPreferenceMap;
    categories?: CategoryDefaults;
  };
  database?: {
    timeline?: object;
    digests?: object;
    rateLimits?: object;
  };
  idempotencyKeyTtlMs?: number;
  timelineRetentionMs?: number;
};

const ID_RE = /^[a-z][a-z0-9._-]*$/;
const VALID_CHANNEL_TYPES: ReadonlySet<string> = new Set(["inbox", "email", "webhook", "sms"]);
const VALID_SCHEMA_TYPES: ReadonlySet<string> = new Set<PrimitiveSchema>(["string", "number", "boolean"]);

function isLegacyFallback(
  fb: InboxChannelConfig | FallbackRule[],
): fb is InboxChannelConfig {
  return !Array.isArray(fb);
}

function collectChannelShapeIssues(
  notificationId: string,
  ch: ChannelConfig,
  index: number,
  out: ValidationIssue[],
): void {
  const label = `${ch.type}[${index}]`;
  if (ch.type === "inbox") {
    if (typeof ch.title !== "string" || ch.title.length === 0) {
      out.push({
        severity: "error",
        code: "INVALID_CHANNEL_SHAPE",
        notificationId,
        channel: label,
        field: "title",
        message: `Notification "${notificationId}" inbox channel is missing "title".`,
        fix: `Add a title string: channel.inbox({ title: "..." }).`,
      });
    }
  } else if (ch.type === "email") {
    if (typeof ch.subject !== "string" || ch.subject.length === 0) {
      out.push({
        severity: "error",
        code: "INVALID_CHANNEL_SHAPE",
        notificationId,
        channel: label,
        field: "subject",
        message: `Notification "${notificationId}" email channel is missing "subject".`,
        fix: `Add a subject string: channel.email({ subject: "...", body: "..." }).`,
      });
    }
    if (typeof ch.body !== "string" || ch.body.length === 0) {
      out.push({
        severity: "error",
        code: "INVALID_CHANNEL_SHAPE",
        notificationId,
        channel: label,
        field: "body",
        message: `Notification "${notificationId}" email channel is missing "body".`,
        fix: `Add a body string: channel.email({ subject: "...", body: "..." }).`,
      });
    }
  } else if (ch.type === "webhook") {
    if (typeof ch.url !== "string" || ch.url.length === 0) {
      out.push({
        severity: "error",
        code: "INVALID_CHANNEL_SHAPE",
        notificationId,
        channel: label,
        field: "url",
        message: `Notification "${notificationId}" webhook channel is missing "url".`,
        fix: `Add a url string: channel.webhook({ url: "https://..." }).`,
      });
    }
  } else if (ch.type === "sms") {
    if (typeof ch.body !== "string" || ch.body.length === 0) {
      out.push({
        severity: "error",
        code: "INVALID_CHANNEL_SHAPE",
        notificationId,
        channel: label,
        field: "body",
        message: `Notification "${notificationId}" sms channel is missing "body".`,
        fix: `Add a body string: channel.sms({ body: "..." }).`,
      });
    }
  }
}

function collectTemplateIssues(
  notificationId: string,
  channel: string,
  field: string,
  template: string,
  payloadKeys: Set<string>,
  out: ValidationIssue[],
): void {
  const vars = new Set(extractTemplateVars(template));
  for (const v of vars) {
    if (!payloadKeys.has(v)) {
      out.push({
        severity: "error",
        code: "UNKNOWN_TEMPLATE_VAR",
        notificationId,
        channel,
        field,
        message: `Template references "{{${v}}}" but "${v}" is not in the payload schema.`,
        fix: `Add "${v}" to the payload schema or fix the template.`,
      });
    }
  }
}

function collectChannelTemplateIssues(
  notificationId: string,
  ch: ChannelConfig,
  label: string,
  payloadKeys: Set<string>,
  out: ValidationIssue[],
): void {
  if (ch.type === "inbox") {
    collectTemplateIssues(notificationId, label, "title", ch.title, payloadKeys, out);
    if (ch.body !== undefined) {
      collectTemplateIssues(notificationId, label, "body", ch.body, payloadKeys, out);
    }
    if (ch.actionUrl !== undefined) {
      collectTemplateIssues(notificationId, label, "actionUrl", ch.actionUrl, payloadKeys, out);
    }
  } else if (ch.type === "email") {
    collectTemplateIssues(notificationId, label, "subject", ch.subject, payloadKeys, out);
    collectTemplateIssues(notificationId, label, "body", ch.body, payloadKeys, out);
  } else if (ch.type === "webhook") {
    collectTemplateIssues(notificationId, label, "url", ch.url, payloadKeys, out);
    if (ch.headers) {
      for (const [hk, hv] of Object.entries(ch.headers)) {
        collectTemplateIssues(notificationId, label, `headers.${hk}`, hv, payloadKeys, out);
      }
    }
  } else if (ch.type === "sms") {
    collectTemplateIssues(notificationId, label, "body", ch.body, payloadKeys, out);
  }
}

export function validateConfig(input: ValidateConfigInput): ValidationIssue[] {
  const { notifications, providers, defaults } = input;
  const issues: ValidationIssue[] = [];
  const seenIds = new Set<string>();

  if (input.unsubscribe && input.unsubscribe.secret.length < 32) {
    issues.push({
      severity: "error",
      code: "WEAK_UNSUBSCRIBE_SECRET",
      field: "unsubscribe.secret",
      message: `unsubscribe.secret must be at least 32 characters (got ${input.unsubscribe.secret.length}).`,
      fix: `Generate one: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`,
    });
  }

  for (const def of notifications) {
    // --- id checks ---
    if (!def.id) {
      issues.push({
        severity: "error",
        code: "EMPTY_ID",
        notificationId: "",
        field: "id",
        message: "Notification id must not be empty.",
        fix: "Provide a non-empty string id for the notification.",
      });
      continue;
    }
    if (isSyntheticPreferenceKey(def.id)) {
      issues.push({
        severity: "error",
        code: "RESERVED_ID",
        notificationId: def.id,
        field: "id",
        message: `Notification id "${def.id}" is reserved for internal preference keys.`,
        fix: "Choose a different id that does not start with \"__\".",
      });
      continue;
    }
    if (seenIds.has(def.id)) {
      issues.push({
        severity: "error",
        code: "DUPLICATE_ID",
        notificationId: def.id,
        field: "id",
        message: `Duplicate notification id "${def.id}".`,
        fix: "Notification ids must be unique across all definitions.",
      });
      continue;
    }
    seenIds.add(def.id);

    if (!ID_RE.test(def.id)) {
      issues.push({
        severity: "warning",
        code: "ID_NAMING_CONVENTION",
        notificationId: def.id,
        field: "id",
        message: `Notification id "${def.id}" does not match recommended convention (lowercase, dot/dash/underscore separators).`,
        fix: `Consider renaming to something like "${def.id.toLowerCase().replace(/[^a-z0-9._-]/g, "-")}".`,
      });
    }

    // --- payload schema validation ---
    if (!def.payload || typeof def.payload !== "object") {
      issues.push({
        severity: "error",
        code: "INVALID_PAYLOAD",
        notificationId: def.id,
        field: "payload",
        message: `Notification "${def.id}" payload must be a non-null object.`,
        fix: `Provide a payload schema: { fieldName: "string" | "number" | "boolean" }.`,
      });
      continue;
    }
    for (const [key, schemaType] of Object.entries(def.payload)) {
      if (!/^[\w$]+$/.test(key)) {
        issues.push({
          severity: "warning",
          code: "INVALID_PAYLOAD_KEY",
          notificationId: def.id,
          field: `payload.${key}`,
          message: `Payload field "${key}" contains characters not supported in {{template}} variables (only letters, digits, underscore, and $ are allowed).`,
          fix: `Rename "${key}" to use only [a-zA-Z0-9_$] characters, e.g. "${key.replace(/[^\w$]/g, "_")}".`,
        });
      }
      if (!VALID_SCHEMA_TYPES.has(schemaType)) {
        issues.push({
          severity: "error",
          code: "INVALID_SCHEMA_TYPE",
          notificationId: def.id,
          field: `payload.${key}`,
          message: `Payload field "${key}" has unsupported type "${schemaType}".`,
          fix: `Supported types: "string", "number", "boolean". Change "${key}" to one of these.`,
        });
      }
      if (key === "_unsubscribeUrl") {
        issues.push({
          severity: "warning",
          code: "RESERVED_PAYLOAD_KEY",
          notificationId: def.id,
          field: `payload.${key}`,
          message: `Payload field "_unsubscribeUrl" is reserved. Its value will be overridden at render time when unsubscribe is configured.`,
          fix: `Rename the field to avoid the "_unsubscribeUrl" reserved key.`,
        });
      }
    }

    // --- channels ---
    if (def.channels.length === 0) {
      issues.push({
        severity: "error",
        code: "NO_CHANNELS",
        notificationId: def.id,
        field: "channels",
        message: `Notification "${def.id}" has no channels configured.`,
        fix: "Add at least one channel (e.g. channel.inbox({ title: \"...\" })).",
      });
    }

    const seenTypes = new Set<string>();
    for (const [i, ch] of def.channels.entries()) {
      collectChannelShapeIssues(def.id, ch, i, issues);
      if (seenTypes.has(ch.type)) {
        issues.push({
          severity: "error",
          code: "DUPLICATE_CHANNEL_TYPE",
          notificationId: def.id,
          channel: ch.type,
          field: "channels",
          message: `Notification "${def.id}" has duplicate "${ch.type}" channel configs.`,
          fix: "Each channel type may only appear once per notification.",
        });
      }
      seenTypes.add(ch.type);
    }

    // --- template variable checks ---
    const channelTypes = new Set(def.channels.map((ch) => ch.type));
    const schemaKeys = new Set(Object.keys(def.payload));
    const payloadKeys = new Set([...schemaKeys, "_unsubscribeUrl"]);

    for (const [i, ch] of def.channels.entries()) {
      const label = `${ch.type}[${i}]`;
      collectChannelTemplateIssues(def.id, ch, label, payloadKeys, issues);
      if (ch.type === "email" && !input.unsubscribe) {
        const templates = [ch.subject, ch.body];
        for (const t of templates) {
          if (t.includes("{{_unsubscribeUrl}}")) {
            issues.push({
              severity: "warning",
              code: "UNSUBSCRIBE_URL_WITHOUT_CONFIG",
              notificationId: def.id,
              channel: "email",
              field: "unsubscribe",
              message: `Notification "${def.id}" uses {{_unsubscribeUrl}} but unsubscribe is not configured.`,
              fix: `Add unsubscribe: { secret: "...", baseUrl: "..." } to createNotifyKit() or remove the template variable.`,
            });
            break;
          }
        }
      }
    }

    // --- fallback checks ---
    if (def.fallback) {
      if (Array.isArray(def.fallback) && !isLegacyFallback(def.fallback) && def.fallback.length === 0) {
        issues.push({
          severity: "warning",
          code: "EMPTY_FALLBACK",
          notificationId: def.id,
          field: "fallback",
          message: `Notification "${def.id}" has an empty fallback array. Remove the fallback property or add at least one rule.`,
        });
      }
      const fallbackConfigs = isLegacyFallback(def.fallback)
        ? [def.fallback]
        : def.fallback.map((r) => r.then);
      for (const fb of fallbackConfigs) {
        collectChannelTemplateIssues(def.id, fb, "fallback", payloadKeys, issues);
      }
      if (!isLegacyFallback(def.fallback)) {
        const validTriggers = new Set<string>(["channel.failed", "missing_address", "skipped"]);
        const validChannelTypes = new Set<string>(["inbox", "email", "webhook", "sms"]);
        for (const [ri, rule] of def.fallback.entries()) {
          if (!validTriggers.has(rule.if)) {
            issues.push({
              severity: "error",
              code: "UNKNOWN_FALLBACK_TRIGGER",
              notificationId: def.id,
              channel: "fallback",
              field: "fallback.if",
              message: `Notification "${def.id}" fallback[${ri}] has unknown trigger "${rule.if}".`,
              fix: `Valid triggers: ${[...validTriggers].join(", ")}.`,
            });
          }
          if (rule.from !== undefined) {
            if (!validChannelTypes.has(rule.from)) {
              issues.push({
                severity: "error",
                code: "INVALID_FALLBACK_FROM",
                notificationId: def.id,
                channel: "fallback",
                field: "fallback.from",
                message: `Notification "${def.id}" fallback[${ri}] has unknown "from" channel type "${rule.from}".`,
                fix: `Valid channel types: ${[...validChannelTypes].join(", ")}.`,
              });
            } else if (!channelTypes.has(rule.from as ChannelType)) {
              issues.push({
                severity: "warning",
                code: "FALLBACK_FROM_NOT_DECLARED",
                notificationId: def.id,
                channel: "fallback",
                field: "fallback.from",
                message: `Notification "${def.id}" fallback[${ri}] references "from: ${rule.from}" but the notification does not declare a ${rule.from} channel. This rule will never match.`,
                fix: `Remove "from: ${rule.from}" or add a ${rule.from} channel to the notification.`,
              });
            }
          }
          if (rule.from && rule.then.type === rule.from) {
            issues.push({
              severity: "warning",
              code: "CIRCULAR_FALLBACK",
              notificationId: def.id,
              channel: "fallback",
              field: `fallback[${ri}]`,
              message: `Notification "${def.id}" fallback[${ri}] falls back from "${rule.from}" to the same channel type "${rule.then.type}". This creates a circular fallback that will always fail.`,
              fix: `Change the fallback target to a different channel type, or remove "from: ${rule.from}".`,
            });
          }
          collectChannelShapeIssues(def.id, rule.then, ri, issues);
        }
      } else {
        collectChannelShapeIssues(def.id, def.fallback, 0, issues);
      }
    }

    // --- redact field checks ---
    if (def.redact) {
      for (const field of def.redact) {
        const key = String(field);
        if (!schemaKeys.has(key)) {
          issues.push({
            severity: "error",
            code: "UNKNOWN_REDACT_FIELD",
            notificationId: def.id,
            field: "redact",
            message: `Redact list includes "${key}" but it is not in the payload schema.`,
            fix: `Payload keys: ${[...schemaKeys].join(", ") || "(none)"}. Remove "${key}" or add it to the schema.`,
          });
        }
      }
    }

    // --- digest config validation ---
    if (def.digest) {
      if (!Number.isFinite(def.digest.windowMs) || def.digest.windowMs <= 0) {
        issues.push({
          severity: "error",
          code: "INVALID_DIGEST_WINDOW",
          notificationId: def.id,
          field: "digest.windowMs",
          message: `Notification "${def.id}" digest.windowMs must be a positive number, got ${def.digest.windowMs}.`,
          fix: "Set windowMs to a positive millisecond value (e.g. digest: { windowMs: 60000, render: ... }).",
        });
      }
      if (typeof def.digest.render !== "function") {
        issues.push({
          severity: "error",
          code: "INVALID_DIGEST_RENDER",
          notificationId: def.id,
          field: "digest.render",
          message: `Notification "${def.id}" digest.render must be a function.`,
          fix: "Provide a render function: digest: { windowMs: ..., render: ({ payloads }) => ... }.",
        });
      }
      if (def.digest.key !== undefined && typeof def.digest.key !== "function") {
        issues.push({
          severity: "error",
          code: "INVALID_DIGEST_KEY",
          notificationId: def.id,
          field: "digest.key",
          message: `Notification "${def.id}" digest.key must be a function if provided.`,
          fix: "Provide a key function: digest: { key: ({ recipientId, payload }) => ... }.",
        });
      }
    }

    // --- version check ---
    if (def.version !== undefined && (!Number.isInteger(def.version) || def.version < 1)) {
      issues.push({
        severity: "error",
        code: "INVALID_VERSION",
        notificationId: def.id,
        field: "version",
        message: `Version must be a positive integer, got ${def.version}.`,
        fix: "Set version to a positive integer (e.g. version: 1) or remove it to leave unversioned.",
      });
    }

    // --- provider requirement checks ---
    if (channelTypes.has("email") && !providers?.email) {
      issues.push({
        severity: "error",
        code: "MISSING_PROVIDER",
        notificationId: def.id,
        channel: "email",
        field: "providers.email",
        message: `Notification "${def.id}" has an email channel but no email provider is configured.`,
        fix: "Pass a provider via createNotifyKit({ providers: { email: ... } }).",
      });
    }
    if (channelTypes.has("webhook") && !providers?.webhook) {
      issues.push({
        severity: "error",
        code: "MISSING_PROVIDER",
        notificationId: def.id,
        channel: "webhook",
        field: "providers.webhook",
        message: `Notification "${def.id}" has a webhook channel but no webhook provider is configured.`,
        fix: "Pass a provider via createNotifyKit({ providers: { webhook: ... } }).",
      });
    }
    if (channelTypes.has("sms") && !providers?.sms) {
      issues.push({
        severity: "error",
        code: "MISSING_PROVIDER",
        notificationId: def.id,
        channel: "sms",
        field: "providers.sms",
        message: `Notification "${def.id}" has an sms channel but no sms provider is configured.`,
        fix: "Pass a provider via createNotifyKit({ providers: { sms: ... } }).",
      });
    }

    // --- fallback provider checks ---
    if (def.fallback) {
      const fallbackTypes = new Set(
        isLegacyFallback(def.fallback)
          ? [def.fallback.type]
          : def.fallback.map((r) => r.then.type),
      );
      if (fallbackTypes.has("email") && !providers?.email) {
        issues.push({
          severity: "error",
          code: "MISSING_PROVIDER",
          notificationId: def.id,
          channel: "email",
          field: "providers.email",
          message: `Notification "${def.id}" has a fallback targeting email but no email provider is configured.`,
          fix: "Pass a provider via createNotifyKit({ providers: { email: ... } }).",
        });
      }
      if (fallbackTypes.has("webhook") && !providers?.webhook) {
        issues.push({
          severity: "error",
          code: "MISSING_PROVIDER",
          notificationId: def.id,
          channel: "webhook",
          field: "providers.webhook",
          message: `Notification "${def.id}" has a fallback targeting webhook but no webhook provider is configured.`,
          fix: "Pass a provider via createNotifyKit({ providers: { webhook: ... } }).",
        });
      }
      if (fallbackTypes.has("sms") && !providers?.sms) {
        issues.push({
          severity: "error",
          code: "MISSING_PROVIDER",
          notificationId: def.id,
          channel: "sms",
          field: "providers.sms",
          message: `Notification "${def.id}" has a fallback targeting sms but no sms provider is configured.`,
          fix: "Pass a provider via createNotifyKit({ providers: { sms: ... } }).",
        });
      }
    }

    // --- classification check ---
    if (
      def.classification &&
      def.classification !== "transactional" &&
      def.classification !== "product" &&
      def.classification !== "marketing"
    ) {
      issues.push({
        severity: "error",
        code: "INVALID_CLASSIFICATION",
        notificationId: def.id,
        field: "classification",
        message: `Notification "${def.id}" has invalid classification "${def.classification}".`,
        fix: `Must be "transactional", "product", or "marketing".`,
      });
    }

    // --- defaultChannels coherence ---
    if (def.defaultChannels) {
      for (const ch of Object.keys(def.defaultChannels)) {
        if (!channelTypes.has(ch as ChannelType)) {
          issues.push({
            severity: "error",
            code: "INVALID_DEFAULT_CHANNEL",
            notificationId: def.id,
            channel: ch,
            field: "defaultChannels",
            message: `Notification "${def.id}" defaultChannels references "${ch}" but the notification only declares: ${[...channelTypes].join(", ")}.`,
            fix: `Remove "${ch}" from defaultChannels or add a ${ch} channel to the notification.`,
          });
        }
      }
    }

    // --- required notification + unsubscribe toggle coherence ---
    if (def.required) {
      const emailTemplate = channelTypes.has("email")
        ? def.channels.find((ch) => ch.type === "email")
        : null;
      if (emailTemplate && emailTemplate.type === "email") {
        const fields: string[] = [];
        if (extractTemplateVars(emailTemplate.body).includes("_unsubscribeUrl")) {
          fields.push("body");
        }
        if (extractTemplateVars(emailTemplate.subject).includes("_unsubscribeUrl")) {
          fields.push("subject");
        }
        if (fields.length > 0) {
          issues.push({
            severity: "error",
            code: "REQUIRED_WITH_UNSUBSCRIBE",
            notificationId: def.id,
            channel: "email",
            field: "required",
            message: `Notification "${def.id}" is marked required but its email ${fields.join(" and ")} references {{_unsubscribeUrl}}.`,
            fix: "Required notifications cannot be unsubscribed. Remove the unsubscribe link or set required: false.",
          });
        }
      }
    }

    // --- rateLimit config validation ---
    if (def.rateLimit) {
      if (!Number.isInteger(def.rateLimit.max) || def.rateLimit.max < 1) {
        issues.push({
          severity: "error",
          code: "INVALID_RATE_LIMIT",
          notificationId: def.id,
          field: "rateLimit.max",
          message: `Notification "${def.id}" rateLimit.max must be a positive integer, got ${def.rateLimit.max}.`,
          fix: "Set max to a positive integer (e.g. rateLimit: { max: 5, windowMs: 60000 }).",
        });
      }
      if (!Number.isFinite(def.rateLimit.windowMs) || def.rateLimit.windowMs <= 0) {
        issues.push({
          severity: "error",
          code: "INVALID_RATE_LIMIT",
          notificationId: def.id,
          field: "rateLimit.windowMs",
          message: `Notification "${def.id}" rateLimit.windowMs must be a positive number, got ${def.rateLimit.windowMs}.`,
          fix: "Set windowMs to a positive millisecond value (e.g. rateLimit: { max: 5, windowMs: 60000 }).",
        });
      }
    }

    // --- SMS without rate limit warning ---
    if (channelTypes.has("sms") && !def.rateLimit) {
      issues.push({
        severity: "warning",
        code: "SMS_NO_RATE_LIMIT",
        notificationId: def.id,
        channel: "sms",
        field: "rateLimit",
        message: `Notification "${def.id}" sends SMS but has no rate limit configured.`,
        fix: "Consider adding rateLimit: { max: N, windowMs: ... } to avoid excessive SMS costs.",
      });
    }
  }

  // --- defaults.channels coherence ---
  if (defaults?.channels) {
    for (const ch of Object.keys(defaults.channels)) {
      if (!VALID_CHANNEL_TYPES.has(ch)) {
        issues.push({
          severity: "error",
          code: "INVALID_DEFAULT_CHANNEL_TYPE",
          field: "defaults.channels",
          message: `defaults.channels references unknown channel type "${ch}".`,
          fix: `Valid channel types: ${[...VALID_CHANNEL_TYPES].join(", ")}.`,
        });
      }
    }
  }

  // --- category defaults coherence ---
  if (defaults?.categories) {
    const allCategories = new Set(
      notifications.map((n) => n.category).filter(Boolean) as string[],
    );
    for (const cat of Object.keys(defaults.categories)) {
      if (!allCategories.has(cat)) {
        issues.push({
          severity: "error",
          code: "UNKNOWN_CATEGORY",
          field: "defaults.categories",
          message: `Category default "${cat}" does not match any registered notification category.`,
          fix: `Known categories: ${[...allCategories].join(", ") || "(none)"}. Remove "${cat}" or add it to a notification definition.`,
        });
      }
    }
    for (const [cat, prefs] of Object.entries(defaults.categories)) {
      for (const ch of Object.keys(prefs)) {
        if (!VALID_CHANNEL_TYPES.has(ch)) {
          issues.push({
            severity: "error",
            code: "INVALID_CATEGORY_CHANNEL",
            field: `defaults.categories.${cat}`,
            message: `Category default "${cat}" references unknown channel type "${ch}".`,
            fix: `Valid channel types: ${[...VALID_CHANNEL_TYPES].join(", ")}.`,
          });
        }
      }
    }
  }

  // --- unsubscribe.baseUrl format ---
  if (input.unsubscribe) {
    const { baseUrl } = input.unsubscribe;
    let parsedUrl: URL | null = null;
    try {
      parsedUrl = baseUrl ? new URL(baseUrl) : null;
    } catch {}
    if (!parsedUrl || !["http:", "https:"].includes(parsedUrl.protocol)) {
      issues.push({
        severity: "error",
        code: "INVALID_UNSUBSCRIBE_URL",
        field: "unsubscribe.baseUrl",
        message: baseUrl
          ? `unsubscribe.baseUrl must be a valid http/https URL, got "${baseUrl}".`
          : "unsubscribe.baseUrl must not be empty.",
        fix: "Provide the absolute URL including scheme, e.g. \"https://app.com/api/notifykit\".",
      });
    }
  }

  // --- idempotencyKeyTtlMs validation ---
  if (input.idempotencyKeyTtlMs !== undefined) {
    if (!Number.isFinite(input.idempotencyKeyTtlMs) || input.idempotencyKeyTtlMs <= 0) {
      issues.push({
        severity: "error",
        code: "INVALID_IDEMPOTENCY_TTL",
        field: "idempotencyKeyTtlMs",
        message: `idempotencyKeyTtlMs must be a positive number, got ${input.idempotencyKeyTtlMs}.`,
        fix: "Set to a positive millisecond value (e.g. 86400000 for 24 hours).",
      });
    }
  }

  // --- timelineRetentionMs validation ---
  if (input.timelineRetentionMs !== undefined) {
    if (!Number.isFinite(input.timelineRetentionMs) || input.timelineRetentionMs < 0) {
      issues.push({
        severity: "error",
        code: "INVALID_TIMELINE_RETENTION",
        field: "timelineRetentionMs",
        message: `timelineRetentionMs must be a non-negative number, got ${input.timelineRetentionMs}.`,
        fix: "Set to a positive millisecond value (e.g. 604800000 for 7 days) or 0 to disable.",
      });
    }
  }

  // --- adapter capability checks ---
  if (input.database) {
    const usesDigest = notifications.some((n) => n.digest);
    if (usesDigest && !input.database.digests) {
      issues.push({
        severity: "error",
        code: "MISSING_ADAPTER_CAPABILITY",
        field: "database.digests",
        message: "One or more notifications use digest but the database adapter does not provide a digests store.",
        fix: "Use a database adapter that supports digests, or remove digest config from notifications.",
      });
    }

    const usesRateLimit = notifications.some((n) => n.rateLimit);
    if (usesRateLimit && !input.database.rateLimits) {
      issues.push({
        severity: "error",
        code: "MISSING_ADAPTER_CAPABILITY",
        field: "database.rateLimits",
        message: "One or more notifications use rateLimit but the database adapter does not provide a rateLimits store.",
        fix: "Use a database adapter that supports rate limits, or remove rateLimit config from notifications.",
      });
    }
  }

  // --- webhook secret warning ---
  if (notifications.some((n) => n.channels.some((ch) => ch.type === "webhook"))) {
    if (input.providers?.webhook && !input.providers.webhook.signed) {
      issues.push({
        severity: "warning",
        code: "WEBHOOK_NO_SECRET",
        channel: "webhook",
        field: "providers.webhook",
        message: "Webhook provider has no signing secret configured. Recipients cannot verify payload authenticity.",
        fix: "Pass a secret to webhookProvider({ secret: \"...\" }) for HMAC-SHA256 request signing.",
      });
    }
  }

  return issues;
}

export function formatValidationIssues(issues: ValidationIssue[]): string {
  if (issues.length === 0) return "";
  const lines: string[] = [];
  for (const issue of issues) {
    const prefix = issue.severity === "error" ? "ERROR" : "WARN";
    const loc = issue.notificationId
      ? issue.channel
        ? `[${issue.notificationId} → ${issue.channel}]`
        : `[${issue.notificationId}]`
      : "";
    lines.push(`${prefix} ${loc} ${issue.message}${issue.fix ? ` ${issue.fix}` : ""}`);
  }
  return lines.join("\n");
}
