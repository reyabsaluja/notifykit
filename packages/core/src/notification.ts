import type {
  NotificationDefinition,
  PayloadSchema,
} from "./types.js";

export function notification<Id extends string, S extends PayloadSchema>(
  def: NotificationDefinition<Id, S>,
): NotificationDefinition<Id, S> {
  return def;
}
