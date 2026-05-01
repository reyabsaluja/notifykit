import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
/**
 * Create NotifyKit's Postgres tables if they don't exist.
 *
 * This is meant for quick starts, tests, and prototypes. Production
 * apps should generate migrations with drizzle-kit instead.
 */
export declare function createPgTables(db: PgDatabase<PgQueryResultHKT, any, any>): Promise<void>;
//# sourceMappingURL=create-pg-tables.d.ts.map