import { existsSync, statSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import type {
  CategoryDefaults,
  ChannelPreferenceMap,
  EmailProvider,
  NotificationDefinition,
  PayloadSchema,
  RetryPolicy,
  SmsProvider,
  WebhookProvider,
} from "@notifykitjs/core";

export type NotifyKitConfig = {
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
  retry?: Partial<RetryPolicy>;
  idempotencyKeyTtlMs?: number;
  timelineRetentionMs?: number;
};

export function defineConfig(config: NotifyKitConfig): NotifyKitConfig {
  return config;
}

const DEFAULT_CONFIG_PATHS = [
  "notifykit.config.ts",
  "notifykit.config.js",
  "notifykit.config.mjs",
];

export async function loadConfig(
  cwd: string,
  explicitPath?: string,
): Promise<{ config: NotifyKitConfig; path: string }> {
  const candidate = explicitPath
    ? resolve(cwd, explicitPath)
    : findDefaultConfigPath(cwd);

  if (!candidate) {
    throw new ConfigError(
      `No NotifyKit config found. Expected one of: ${DEFAULT_CONFIG_PATHS.join(", ")} in ${cwd}`,
    );
  }
  if (!existsSync(candidate) || !statSync(candidate).isFile()) {
    throw new ConfigError(`Config file not found: ${candidate}`);
  }

  const mod = await importConfigModule(candidate);
  const config = mod.default ?? mod.config;
  if (!config) {
    throw new ConfigError(
      `Config file ${candidate} must default-export a config object (use defineConfig()).`,
    );
  }
  validateConfigShape(config, candidate);
  return { config, path: candidate };
}

async function importConfigModule(candidate: string): Promise<{
  default?: NotifyKitConfig;
  config?: NotifyKitConfig;
}> {
  const url = pathToFileURL(candidate).href;
  if (candidate.endsWith(".ts") || candidate.endsWith(".tsx")) {
    if (typeof (globalThis as { Bun?: unknown }).Bun !== "undefined") {
      return (await import(url)) as {
        default?: NotifyKitConfig;
        config?: NotifyKitConfig;
      };
    }
    try {
      const { tsImport } = (await import("tsx/esm/api")) as {
        tsImport: (specifier: string, parentURL: string) => Promise<unknown>;
      };
      return (await tsImport(candidate, import.meta.url)) as {
        default?: NotifyKitConfig;
        config?: NotifyKitConfig;
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new ConfigError(
        `Failed to load TypeScript config ${candidate}: ${message}`,
      );
    }
  }
  return (await import(url)) as {
    default?: NotifyKitConfig;
    config?: NotifyKitConfig;
  };
}

function findDefaultConfigPath(cwd: string): string | null {
  for (const name of DEFAULT_CONFIG_PATHS) {
    const full = resolve(cwd, name);
    if (existsSync(full)) return full;
  }
  return null;
}

function validateConfigShape(config: unknown, path: string): void {
  if (!config || typeof config !== "object") {
    throw new ConfigError(`Config at ${path} is not an object.`);
  }
  const c = config as Partial<NotifyKitConfig>;
  if (!Array.isArray(c.notifications)) {
    throw new ConfigError(
      `Config at ${path} is missing a "notifications" array.`,
    );
  }
  for (const [i, def] of c.notifications.entries()) {
    if (!def || typeof def !== "object") {
      throw new ConfigError(
        `Config at ${path}: notifications[${i}] is not an object.`,
      );
    }
    const d = def as Partial<NotificationDefinition>;
    if (typeof d.id !== "string") {
      throw new ConfigError(
        `Config at ${path}: notifications[${i}] is missing "id".`,
      );
    }
    if (!d.payload || typeof d.payload !== "object") {
      throw new ConfigError(
        `Config at ${path}: notification "${d.id}" is missing "payload".`,
      );
    }
    if (!Array.isArray(d.channels)) {
      throw new ConfigError(
        `Config at ${path}: notification "${d.id}" is missing "channels".`,
      );
    }
  }
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}
