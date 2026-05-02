import type { CategoryDefaults, ChannelPreferenceMap, NotificationDefinition, PayloadSchema, PreferenceExplanation, Recipient, RecipientPreference, SecurityScope } from "./types.js";
export type ResolutionContext = {
    def: NotificationDefinition<string, PayloadSchema>;
    recipient: Recipient;
    scope: SecurityScope;
    appDefaults?: ChannelPreferenceMap;
    categoryDefaults?: CategoryDefaults;
    tenantChannels?: ChannelPreferenceMap | null;
    userGlobal?: RecipientPreference | null;
    userCategory?: RecipientPreference | null;
    userNotification?: RecipientPreference | null;
};
export declare function resolvePreferences(ctx: ResolutionContext): PreferenceExplanation;
//# sourceMappingURL=resolve-preferences.d.ts.map