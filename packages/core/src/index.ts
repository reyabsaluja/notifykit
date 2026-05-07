export { channel } from "./channel.js";
export { notification } from "./notification.js";
export { createNotifyKit, SKIP_PROVIDER } from "./create-notifykit.js";
export {
  GLOBAL_PREFERENCE_KEY,
  categoryPreferenceKey,
  isCategoryPreferenceKey,
  isSyntheticPreferenceKey,
  parseCategoryFromKey,
} from "./preference-keys.js";
export { createHandler } from "./handler.js";
export { memoryAdapter } from "./memory-adapter.js";
export { memoryRealtimeAdapter, normalizeScope } from "./realtime.js";
export {
  fakeEmailProvider,
  fakeSmsProvider,
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
export {
  validateConfig,
  formatValidationIssues,
} from "./validate.js";
export { SKIP_REASONS, TIMELINE_EVENT_TYPES } from "./types.js";

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
  SmsChannelFactory,
  SmsChannelInput,
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
  FakeSmsProvider,
  FakeSmsProviderOptions,
  FakeWebhookProvider,
  FakeWebhookProviderOptions,
  SentEmail,
  SentSms,
  SentWebhook,
  WebhookProviderOptions,
} from "./providers.js";

export type { ResolutionContext } from "./resolve-preferences.js";

export type {
  NotifyKitErrorContext,
  PayloadFieldError,
  SafeWebhookResult,
} from "./utils.js";
export type {
  ValidateConfigInput,
  ValidationIssue,
  ValidationSeverity,
} from "./validate.js";

export type {
  CategoryDefaults,
  ChannelConfig,
  ChannelOutcome,
  ChannelPreferenceMap,
  ChannelResolution,
  ChannelType,
  DatabaseAdapter,
  DedupeRecord,
  DeliveryExplanation,
  DeliveryChannel,
  DeliveryJob,
  DeliveryRecord,
  DeliveryStatus,
  DigestBufferEntry,
  DigestConfig,
  EmailChannelConfig,
  EmailProvider,
  FallbackRule,
  FallbackTrigger,
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
  SkipReason,
  SkippedDelivery,
  SmsChannelConfig,
  SmsProvider,
  TimelineEvent,
  TimelineEventType,
  UpdatePreferenceInput,
  UpsertRecipientInput,
  WebhookChannelConfig,
  WebhookProvider,
} from "./types.js";
