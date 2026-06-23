import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@/db";

const isNextBuild = process.env.NEXT_PHASE === "phase-production-build";
const baseURL =
  process.env.BETTER_AUTH_URL ??
  process.env.NEXT_PUBLIC_BETTER_AUTH_URL ??
  (isNextBuild || process.env.NODE_ENV !== "production" ? "http://localhost:3200" : undefined);
const secret =
  process.env.BETTER_AUTH_SECRET ??
  (isNextBuild || process.env.NODE_ENV !== "production"
    ? "notifykit-example-dev-secret-change-me"
    : undefined);

if (!baseURL) {
  throw new Error("BETTER_AUTH_URL is required in production.");
}

if (!secret) {
  throw new Error("BETTER_AUTH_SECRET is required in production.");
}

export const auth = betterAuth({
  baseURL,
  secret,
  database: drizzleAdapter(db, { provider: "sqlite" }),
  emailAndPassword: {
    enabled: true,
  },
});
