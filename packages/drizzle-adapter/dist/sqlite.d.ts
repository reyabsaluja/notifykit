import type { DatabaseAdapter } from "notifykit";
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import { deliveries, inboxItems, notifications, preferences, recipients } from "./schema/sqlite.js";
type SqliteDb = BaseSQLiteDatabase<"sync" | "async", unknown, any, any>;
export type DrizzleSqliteAdapter = DatabaseAdapter & {
    _schema: {
        recipients: typeof recipients;
        notifications: typeof notifications;
        inboxItems: typeof inboxItems;
        deliveries: typeof deliveries;
        preferences: typeof preferences;
    };
};
export declare function drizzleSqliteAdapter(db: SqliteDb): DrizzleSqliteAdapter;
export {};
//# sourceMappingURL=sqlite.d.ts.map