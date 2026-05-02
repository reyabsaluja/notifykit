import type { PayloadSchema } from "./types.js";
export declare function createId(prefix: string): string;
export declare function renderTemplate(template: string, payload: Record<string, unknown>): string;
export declare function extractTemplateVars(template: string): string[];
export declare class NotifyKitError extends Error {
    constructor(message: string);
}
export declare class PayloadValidationError extends NotifyKitError {
    constructor(message: string);
}
export declare function validatePayload(schema: PayloadSchema, payload: unknown, notificationId: string): Record<string, unknown>;
export declare function redactPayload(payload: Record<string, unknown>, redactFields: readonly string[]): Record<string, unknown>;
//# sourceMappingURL=utils.d.ts.map