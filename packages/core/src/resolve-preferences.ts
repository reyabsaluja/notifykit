import type {
  CategoryDefaults,
  ChannelPreferenceMap,
  ChannelResolution,
  ChannelType,
  NotificationDefinition,
  PayloadSchema,
  PreferenceExplanation,
  PreferenceResolutionLayer,
  Recipient,
  RecipientPreference,
  SecurityScope,
} from "./types.js";

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

export function resolveChannel(
  channel: ChannelType,
  ctx: ResolutionContext,
): ChannelResolution {
  const trail: Array<{ layer: PreferenceResolutionLayer; value: boolean | undefined }> = [];

  const appValue = ctx.appDefaults?.[channel] ?? true;
  trail.push({ layer: "app_default", value: appValue });

  const notifDefault = ctx.def.defaultChannels?.[channel];
  trail.push({ layer: "notification_default", value: notifDefault });

  const catDefault =
    ctx.def.category && ctx.categoryDefaults?.[ctx.def.category]
      ? ctx.categoryDefaults[ctx.def.category]![channel]
      : undefined;
  trail.push({ layer: "category_default", value: catDefault });

  const tenantValue = ctx.tenantChannels?.[channel];
  trail.push({ layer: "tenant_setting", value: tenantValue });

  const globalValue = ctx.userGlobal?.channels[channel];
  trail.push({ layer: "user_global", value: globalValue });

  const userCatValue = ctx.userCategory?.channels[channel];
  trail.push({ layer: "user_category", value: userCatValue });

  const userNotifValue = ctx.userNotification?.channels[channel];
  trail.push({ layer: "user_notification", value: userNotifValue });

  let allowed = true;
  let resolvedBy: PreferenceResolutionLayer = "app_default";
  for (const entry of trail) {
    if (entry.value !== undefined) {
      allowed = entry.value;
      resolvedBy = entry.layer;
    }
  }

  if (ctx.def.required) {
    trail.push({ layer: "required_override", value: true });
    allowed = true;
    resolvedBy = "required_override";
  }

  if (channel === "email" && !ctx.recipient.email) {
    trail.push({ layer: "destination_unavailable", value: false });
    allowed = false;
    resolvedBy = "destination_unavailable";
  }

  return {
    channel,
    allowed,
    resolvedBy,
    trail,
    reason: buildReason(channel, allowed, resolvedBy, ctx),
  };
}

function buildReason(
  channel: ChannelType,
  allowed: boolean,
  resolvedBy: PreferenceResolutionLayer,
  ctx: ResolutionContext,
): string {
  const name = ctx.def.id;

  switch (resolvedBy) {
    case "app_default":
      return allowed
        ? `${channel} is enabled by app defaults`
        : `${channel} is disabled by app defaults`;
    case "notification_default":
      return allowed
        ? `${channel} is enabled by "${name}" default channels`
        : `${channel} is disabled by "${name}" default channels`;
    case "category_default":
      return allowed
        ? `${channel} is enabled by "${ctx.def.category}" category defaults`
        : `${channel} is disabled by "${ctx.def.category}" category defaults`;
    case "tenant_setting":
      return allowed
        ? `${channel} is enabled by tenant settings`
        : `${channel} is disabled by tenant settings`;
    case "user_global":
      return allowed
        ? `${channel} is enabled by user global preferences`
        : `${channel} is disabled by user global preferences`;
    case "user_category":
      return allowed
        ? `${channel} is enabled by user "${ctx.def.category}" category preferences`
        : `${channel} is disabled by user "${ctx.def.category}" category preferences`;
    case "user_notification":
      return allowed
        ? `${channel} is enabled by user notification preferences`
        : `${channel} is disabled by user notification preferences`;
    case "required_override":
      return `${channel} is forced on because "${name}" is a required notification`;
    case "destination_unavailable":
      return `${channel} is unavailable — recipient has no ${channel} destination`;
  }
}

export function resolvePreferences(ctx: ResolutionContext): PreferenceExplanation {
  const channelTypes = new Set<ChannelType>();
  for (const ch of ctx.def.channels) {
    channelTypes.add(ch.type);
  }

  const channels: ChannelResolution[] = [];
  for (const type of channelTypes) {
    channels.push(resolveChannel(type, ctx));
  }

  return {
    recipientId: ctx.recipient.id,
    notificationId: ctx.def.id,
    scope: ctx.scope,
    channels,
    required: ctx.def.required ?? false,
    classification: ctx.def.classification,
    category: ctx.def.category,
  };
}
