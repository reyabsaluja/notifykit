"use client";

import { useActionState } from "react";
import { useNotifyKitClient } from "@notifykitjs/react";

type SendState = { error: string | null };

const initialState: SendState = { error: null };

export function DemoSender() {
  const client = useNotifyKitClient();

  async function send(body: Record<string, string>): Promise<void> {
    const response = await fetch("/api/notifykit/demo-send", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const result = await response.json().catch(() => null) as { error?: string } | null;
      throw new Error(result?.error ?? "Send failed");
    }
    await client.inbox.list();
  }

  const [welcomeState, welcomeAction, welcomePending] = useActionState(
    async (): Promise<SendState> => {
      try {
        await send({ notificationId: "welcome" });
        return initialState;
      } catch (error) {
        return { error: error instanceof Error ? error.message : "Send failed" };
      }
    },
    initialState,
  );
  const [commentState, commentAction, commentPending] = useActionState(
    async (_state: SendState, formData: FormData): Promise<SendState> => {
      try {
        await send({
          notificationId: "comment_mentioned",
          actorName: String(formData.get("actorName") ?? ""),
          postTitle: String(formData.get("postTitle") ?? ""),
        });
        return initialState;
      } catch (error) {
        return { error: error instanceof Error ? error.message : "Send failed" };
      }
    },
    initialState,
  );
  const error = welcomeState.error ?? commentState.error;

  return (
    <>
      <div className="button-row">
        <form action={welcomeAction}>
          <button type="submit" className="primary" disabled={welcomePending}>
            {welcomePending ? "Sending…" : "Send welcome"}
          </button>
        </form>
        <form
          action={commentAction}
          style={{ display: "inline-flex", gap: "0.5rem", flexWrap: "wrap" }}
        >
          <input
            name="actorName"
            defaultValue="Rey"
            aria-label="Actor name"
            required
            maxLength={80}
            style={{ padding: "0.4rem" }}
          />
          <input
            name="postTitle"
            defaultValue="Launch Plan"
            aria-label="Post title"
            required
            maxLength={120}
            style={{ padding: "0.4rem" }}
          />
          <button type="submit" disabled={commentPending}>
            {commentPending ? "Sending…" : "Send comment mention"}
          </button>
        </form>
      </div>
      {error ? <p role="alert" style={{ color: "crimson" }}>{error}</p> : null}
    </>
  );
}
