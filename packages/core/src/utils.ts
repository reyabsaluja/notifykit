import type { PayloadSchema } from "./types.js";

export function createId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 10);
  const time = Date.now().toString(36);
  return `${prefix}_${time}${rand}`;
}

export function renderTemplate(
  template: string,
  payload: Record<string, unknown>,
): string {
  return template.replace(/\{\{\s*([\w.$]+)\s*\}\}/g, (_match, key: string) => {
    const value = payload[key];
    if (value === undefined || value === null) return "";
    return String(value);
  });
}

export class NotifyKitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotifyKitError";
  }
}

export class PayloadValidationError extends NotifyKitError {
  constructor(message: string) {
    super(message);
    this.name = "PayloadValidationError";
  }
}

export function validatePayload(
  schema: PayloadSchema,
  payload: unknown,
  notificationId: string,
): Record<string, unknown> {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    throw new PayloadValidationError(
      `Invalid payload for notification "${notificationId}": expected an object.`,
    );
  }

  const data = payload as Record<string, unknown>;
  const result: Record<string, unknown> = {};

  for (const key of Object.keys(schema)) {
    const expected = schema[key];
    const value = data[key];

    if (value === undefined) {
      throw new PayloadValidationError(
        `Invalid payload for "${notificationId}": missing "${key}" (expected ${expected}).`,
      );
    }

    const actual = typeof value;
    if (
      (expected === "string" && actual !== "string") ||
      (expected === "number" && (actual !== "number" || Number.isNaN(value))) ||
      (expected === "boolean" && actual !== "boolean")
    ) {
      throw new PayloadValidationError(
        `Invalid payload for "${notificationId}": expected "${key}" to be ${expected}, got ${actual}.`,
      );
    }

    result[key] = value;
  }

  return result;
}
