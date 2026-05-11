import type { PayloadSchema, NotificationDefinition } from "@notifykitjs/core";
import {
  validateConfig,
  type ValidateConfigInput,
  type ValidationIssue,
  type ValidationSeverity,
} from "@notifykitjs/core/validate";

export type { ValidationIssue, ValidationSeverity };

export function validateNotifications(
  notifications: readonly NotificationDefinition<string, PayloadSchema>[],
  options?: Omit<ValidateConfigInput, "notifications">,
): ValidationIssue[] {
  return validateConfig({ notifications, ...options });
}
