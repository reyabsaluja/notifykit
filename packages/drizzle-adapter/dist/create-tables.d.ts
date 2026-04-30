import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
/**
 * Create NotifyKit's SQLite tables if they don't exist.
 *
 * This is meant for quick starts, tests, and prototypes. Production
 * apps should generate migrations with drizzle-kit instead.
 */
export declare function createSqliteTables(db: BaseSQLiteDatabase<"sync" | "async", unknown, any, any>): Promise<void>;
//# sourceMappingURL=create-tables.d.ts.map