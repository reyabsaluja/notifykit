import { cookies } from "next/headers";

const COOKIE = "notifykit_demo_user";

/**
 * Tiny demo-only "session": stores a user id in a cookie. Replace with your
 * real auth (NextAuth, Clerk, Lucia, …). NotifyKit doesn't care which — it
 * just needs `identify()` on the handler to return the authenticated user's
 * recipient id.
 */
export async function getCurrentUserId(): Promise<string | null> {
  const store = await cookies();
  return store.get(COOKIE)?.value ?? null;
}

export async function setCurrentUserId(id: string): Promise<void> {
  const store = await cookies();
  store.set(COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    // Demo only — tighten in production.
    secure: process.env.NODE_ENV === "production",
  });
}
