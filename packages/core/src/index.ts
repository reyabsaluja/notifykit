export { channel } from "./channel.js";
export { notification } from "./notification.js";
export { createNotifyKit } from "./create-notifykit.js";
export { memoryAdapter } from "./memory-adapter.js";
export { fakeEmailProvider } from "./providers.js";
export {
  NotifyKitError,
  PayloadValidationError,
  renderTemplate,
} from "./utils.js";

export type {
  CreateNotifyKitInput,
  NotifyKit,
} from "./create-notifykit.js";

export type {
  EmailChannelFactory,
  EmailChannelInput,
  InboxChannelFactory,
  InboxChannelInput,
} from "./channel.js";

export type { MemoryAdapter } from "./memory-adapter.js";

export type {
  FakeEmailProvider,
  FakeEmailProviderOptions,
  SentEmail,
} from "./providers.js";

export type {
  ChannelConfig,
  DatabaseAdapter,
  DeliveryRecord,
  DeliveryStatus,
  EmailChannelConfig,
  EmailProvider,
  Hooks,
  InboxChannelConfig,
  InboxItem,
  InferSchema,
  NotificationDefinition,
  NotificationRecord,
  PayloadSchema,
  PrimitiveSchema,
  Recipient,
  SendInput,
  UpsertRecipientInput,
} from "./types.js";
