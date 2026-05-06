import type { PayloadSchema, NotificationDefinition } from "notifykit";
import {
  validateConfig,
  type ValidateConfigInput,
  type ValidationIssue,
  type ValidationSeverity,
} from "notifykit/validate";

export type { ValidationIssue, ValidationSeverity };

export function validateNotifications(
  notifications: readonly NotificationDefinition<string, PayloadSchema>[],
  options?: Omit<ValidateConfigInput, "notifications">,
): ValidationIssue[] {
  return validateConfig({ notifications, ...options });
}
