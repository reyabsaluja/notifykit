import type { ChannelConfig, ChannelPreferenceMap, DigestConfig, InboxChannelConfig, NotificationClassification, NotificationDefinition, PayloadSchema, RateLimitConfig } from "./types.js";
/**
 * User-facing notification input. The digest callbacks are strictly typed
 * against the payload schema for good DX; they're widened to `AnyDigestConfig`
 * on the returned definition so the value is assignable to the engine's
 * `NotificationDefinition<string, PayloadSchema>` base type.
 */
export type NotificationInput<Id extends string, S extends PayloadSchema> = {
    id: Id;
    payload: S;
    channels: ChannelConfig[];
    digest?: DigestConfig<S>;
    rateLimit?: RateLimitConfig;
    fallback?: InboxChannelConfig;
    description?: string;
    category?: string;
    version?: number;
    redact?: readonly (keyof S)[];
    validate?: (payload: unknown) => Record<string, unknown>;
    required?: boolean;
    defaultChannels?: ChannelPreferenceMap;
    classification?: NotificationClassification;
};
export declare function notification<Id extends string, const S extends PayloadSchema>(def: NotificationInput<Id, S>): NotificationDefinition<Id, S>;
//# sourceMappingURL=notification.d.ts.map