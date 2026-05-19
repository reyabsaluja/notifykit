import { createRouteHandler } from "@notifykitjs/next";
import { auth } from "@/lib/auth";
import { notify } from "@/lib/notify";
import { headers } from "next/headers";

// Dev-only: module-level cache resets on serverless cold starts — do not use in production
const syncedRecipients = new Set<string>();

export const { GET, POST, DELETE, OPTIONS, dynamic } = createRouteHandler({
  notifykit: notify,
  identify: async () => {
    const session = await auth.api.getSession({
      headers: await headers(),
    });
    if (!session) return null;
    if (!syncedRecipients.has(session.user.id)) {
      await notify.upsertRecipient({
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
      });
      syncedRecipients.add(session.user.id);
    }
    return session.user.id;
  },
});
