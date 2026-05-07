export {
  drizzleSqliteAdapter,
  type DrizzleSqliteAdapter,
} from "./sqlite.js";
export { createSqliteTables } from "./create-tables.js";
export {
  deliveries,
  digestBuffers,
  inboxItems,
  notifications,
  notifyKitSchema,
  preferences,
  rateLimitEvents,
  recipients,
  scheduledSends,
  timelineEvents,
  type NotifyKitSqliteSchema,
} from "./schema/sqlite.js";

export {
  drizzlePostgresAdapter,
  type DrizzlePostgresAdapter,
} from "./postgres.js";
export { createPgTables } from "./create-pg-tables.js";
export {
  deliveries as pgDeliveries,
  digestBuffers as pgDigestBuffers,
  inboxItems as pgInboxItems,
  notifications as pgNotifications,
  notifyKitPgSchema,
  preferences as pgPreferences,
  rateLimitEvents as pgRateLimitEvents,
  recipients as pgRecipients,
  scheduledSends as pgScheduledSends,
  timelineEvents as pgTimelineEvents,
  type NotifyKitPgSchema,
} from "./schema/postgres.js";
