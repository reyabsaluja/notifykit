import type { DatabaseAdapter } from "notifykit";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { deliveries, digestBuffers, inboxItems, notifications, preferences, rateLimitEvents, recipients, scheduledSends } from "./schema/postgres.js";
type PgDb = PgDatabase<PgQueryResultHKT, any, any>;
export type DrizzlePostgresAdapter = DatabaseAdapter & {
    _schema: {
        recipients: typeof recipients;
        notifications: typeof notifications;
        inboxItems: typeof inboxItems;
        deliveries: typeof deliveries;
        preferences: typeof preferences;
        digestBuffers: typeof digestBuffers;
        rateLimitEvents: typeof rateLimitEvents;
        scheduledSends: typeof scheduledSends;
    };
};
export declare function drizzlePostgresAdapter(db: PgDb): DrizzlePostgresAdapter;
export {};
//# sourceMappingURL=postgres.d.ts.map