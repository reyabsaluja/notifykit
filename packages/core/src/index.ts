export { channel } from "./channel.js";
export { notification } from "./notification.js";
export { createNotifyKit } from "./create-notifykit.js";
export {
  GLOBAL_PREFERENCE_KEY,
  categoryPreferenceKey,
  isSyntheticPreferenceKey,
} from "./preference-keys.js";
export { createHandler } from "./handler.js";
export { memoryAdapter } from "./memory-adapter.js";
export { memoryRealtimeAdapter, normalizeScope } from "./realtime.js";
export {
  fakeEmailProvider,
  fakeWebhookProvider,
  verifyWebhookSignature,
  webhookProvider,
} from "./providers.js";
export {
  defaultRetryPolicy,
  inlineQueue,
  setTimeoutQueue,
} from "./queues.js";
export {
  signUnsubscribeToken,
  verifyUnsubscribeToken,
  type UnsubscribeTokenClaims,
} from "./unsubscribe.js";
export {
  NotifyKitError,
  PayloadValidationError,
  createId,
  extractTemplateVars,
  redactPayload,
  renderTemplate,
} from "./utils.js";

export type {
  Authorize,
  CreateHandlerOptions,
  Handler,
  HandlerContext,
  HandlerIdentity,
  HandlerPermission,
  Identify,
  RedactedDeliveryRecord,
  WebhookEventHandler,
  WebhookVerifier,
} from "./handler.js";

export type {
  CreateNotifyKitInput,
  NotifyKit,
  SendResult,
} from "./create-notifykit.js";

export type {
  EmailChannelFactory,
  EmailChannelInput,
  InboxChannelFactory,
  InboxChannelInput,
  WebhookChannelFactory,
  WebhookChannelInput,
} from "./channel.js";

export type { MemoryAdapter } from "./memory-adapter.js";

export type {
  RealtimeAdapter,
  RealtimeEvent,
  RealtimeListener,
} from "./realtime.js";

export type {
  FakeEmailProvider,
  FakeEmailProviderOptions,
  FakeWebhookProvider,
  FakeWebhookProviderOptions,
  SentEmail,
  SentWebhook,
  WebhookProviderOptions,
} from "./providers.js";

export type { ResolutionContext } from "./resolve-preferences.js";

export type {
  CategoryDefaults,
  ChannelConfig,
  ChannelOutcome,
  ChannelPreferenceMap,
  ChannelResolution,
  ChannelType,
  DatabaseAdapter,
  DeliveryExplanation,
  DeliveryChannel,
  DeliveryJob,
  DeliveryRecord,
  DeliveryStatus,
  DigestBufferEntry,
  DigestConfig,
  EmailChannelConfig,
  EmailProvider,
  GetPreferenceInput,
  Hooks,
  InboxChannelConfig,
  InboxDeleteForRecipientResult,
  InboxItem,
  InboxItemForRecipientResult,
  InboxListFilter,
  InferSchema,
  MarkReadForRecipientResult,
  NotificationClassification,
  NotificationDefinition,
  NotificationIds,
  NotificationRecord,
  PayloadSchema,
  PreferenceExplanation,
  PreferenceResolutionLayer,
  PrimitiveSchema,
  QuietHours,
  Queue,
  RateLimitConfig,
  RateLimitEvent,
  Recipient,
  RecipientPreference,
  RetryPolicy,
  ScheduledSend,
  ScheduledSendStatus,
  SecurityScope,
  SendInput,
  UpdatePreferenceInput,
  UpsertRecipientInput,
  WebhookChannelConfig,
  WebhookProvider,
} from "./types.js";
