export { channel } from "notifykit";
import { defineConfig, type NotifyKitConfig } from "../../src/config.js";

export function defineNotifyKitConfig(config: NotifyKitConfig): NotifyKitConfig {
  return defineConfig(config);
}
