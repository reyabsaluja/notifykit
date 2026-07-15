"use client";

import { useActionState } from "react";
import { useNotifyKitClient } from "@notifykitjs/react";

type SendState = { error: string | null };

const initialState: SendState = { error: null };

export function DemoSender() {
  const client = useNotifyKitClient();
  const [state, action, pending] = useActionState(
    async (_state: SendState, formData: FormData): Promise<SendState> => {
      try {
        const response = await fetch("/api/notifykit/demo-send", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            actorName: String(formData.get("actorName") ?? ""),
            postTitle: String(formData.get("postTitle") ?? ""),
          }),
        });
        if (!response.ok) {
          const result = (await response.json().catch(() => null)) as {
            error?: string;
          } | null;
          throw new Error(result?.error ?? "Send failed");
        }
        await client.inbox.list();
        return initialState;
      } catch (error) {
        return {
          error: error instanceof Error ? error.message : "Send failed",
        };
      }
    },
    initialState,
  );

  return (
    <form
      action={action}
      style={{ display: "grid", gap: "0.5rem", maxWidth: "24rem" }}
    >
      <label>
        Actor name
        <input
          name="actorName"
          defaultValue="Rey"
          required
          maxLength={80}
          style={{ width: "100%" }}
        />
      </label>
      <label>
        Post title
        <input
          name="postTitle"
          defaultValue="Launch Plan"
          required
          maxLength={120}
          style={{ width: "100%" }}
        />
      </label>
      <button type="submit" disabled={pending}>
        {pending ? "Sending…" : "Send"}
      </button>
      {state.error ? (
        <p role="alert" style={{ color: "crimson" }}>
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
