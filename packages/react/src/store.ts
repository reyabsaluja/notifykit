import type { ClientState, NotifyKitClient } from "./client.js";

const snapshots = new WeakMap<NotifyKitClient, () => ClientState>();

export function registerClientSnapshot(
  client: NotifyKitClient,
  getSnapshot: () => ClientState,
): void {
  snapshots.set(client, getSnapshot);
}

export function getClientSnapshot(client: NotifyKitClient): ClientState {
  return snapshots.get(client)?.() ?? client.getState();
}
