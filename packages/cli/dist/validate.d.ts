import type { NotificationDefinition, PayloadSchema } from "notifykit";
export type ValidationIssue = {
    notificationId: string;
    channel: string;
    field: string;
    message: string;
};
export declare function validateNotifications(notifications: readonly NotificationDefinition<string, PayloadSchema>[]): ValidationIssue[];
//# sourceMappingURL=validate.d.ts.map