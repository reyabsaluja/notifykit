import { createRouteHandler } from "@notifykitjs/next";
import { auth } from "@/lib/auth";
import { notify } from "@/lib/notify";
import { headers } from "next/headers";

export const { GET, POST, DELETE, OPTIONS, dynamic } = createRouteHandler({
  notifykit: notify,
  identify: async () => {
    const session = await auth.api.getSession({
      headers: await headers(),
    });
    if (!session) return null;
    return session.user.id;
  },
});
