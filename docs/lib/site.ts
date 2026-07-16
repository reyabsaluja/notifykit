import type { Metadata } from "next";

export const SITE_URL = new URL("https://notifykit.cc");
export const GITHUB_URL = "https://github.com/reyabsaluja/notifykit";
export const SITE_NAME = "NotifyKit";
export const SITE_TITLE = "NotifyKit — App-native notifications for TypeScript";
export const SITE_DESCRIPTION =
  "Define notifications in TypeScript, send them through your own application, and keep notification state in your own database.";

export const DOCS_PAGES = {
  overview: {
    path: "/docs",
    title: "Overview",
    description:
      "Learn how NotifyKit brings typed, multi-channel notification infrastructure directly into your TypeScript application.",
  },
  "why-notifykit": {
    path: "/docs/why-notifykit",
    title: "Why NotifyKit?",
    description:
      "Understand when an embedded notification framework is a better fit than a hosted or self-hosted notification platform.",
  },
  installation: {
    path: "/docs/installation",
    title: "Installation",
    description:
      "Install NotifyKit in an existing TypeScript app or start from a complete Next.js notification scaffold.",
  },
  quickstart: {
    path: "/docs/quickstart",
    title: "Quickstart",
    description:
      "Build and run a working NotifyKit notification flow in a Next.js application in under five minutes.",
  },
  defining: {
    path: "/docs/defining",
    title: "Defining notifications",
    description:
      "Define type-safe notification IDs, payload schemas, channel templates, and delivery behavior in TypeScript.",
  },
  sending: {
    path: "/docs/sending",
    title: "Sending",
    description:
      "Send type-safe notifications and understand NotifyKit's validation, preference, persistence, and delivery pipeline.",
  },
  channels: {
    path: "/docs/channels",
    title: "Channels",
    description:
      "Configure inbox, email, SMS, and webhook channels for notifications defined in your TypeScript application.",
  },
  preferences: {
    path: "/docs/preferences",
    title: "Preferences & unsubscribe",
    description:
      "Implement per-channel notification preferences, layered defaults, and signed RFC 8058 unsubscribe links.",
  },
  digests: {
    path: "/docs/digests",
    title: "Digests & rate limits",
    description:
      "Batch noisy events into digests and cap notification delivery with per-recipient rate limits.",
  },
  "quiet-hours": {
    path: "/docs/quiet-hours",
    title: "Quiet hours",
    description:
      "Defer interruptive notification channels during recipient-local quiet hours without delaying inbox delivery.",
  },
  deduplication: {
    path: "/docs/deduplication",
    title: "Deduplication & idempotency",
    description:
      "Prevent duplicate notifications with explicit deduplication windows and idempotent send operations.",
  },
  fallbacks: {
    path: "/docs/fallbacks",
    title: "Fallback channels",
    description:
      "Configure fallback delivery channels so important notifications are not silently lost after a provider failure.",
  },
  nextjs: {
    path: "/docs/nextjs",
    title: "Next.js",
    description:
      "Integrate NotifyKit with Next.js App Router using route handlers, server actions, and the React provider.",
  },
  react: {
    path: "/docs/react",
    title: "React hooks & components",
    description:
      "Build notification inboxes, bells, unread counts, and preference controls with typed React hooks and components.",
  },
  realtime: {
    path: "/docs/realtime",
    title: "Realtime",
    description:
      "Deliver realtime inbox items and unread-count updates with reconnection and tenant-scoped event support.",
  },
  "production-readiness": {
    path: "/docs/production-readiness",
    title: "Production readiness",
    description:
      "Understand NotifyKit's reliability boundary and the infrastructure required for critical production delivery.",
  },
  database: {
    path: "/docs/database",
    title: "Database adapters",
    description:
      "Store NotifyKit recipients, deliveries, inbox items, and preferences with memory, SQLite, or PostgreSQL adapters.",
  },
  providers: {
    path: "/docs/providers",
    title: "Email & webhook providers",
    description:
      "Configure production email and webhook delivery providers or implement a custom NotifyKit provider.",
  },
  "multi-tenancy": {
    path: "/docs/multi-tenancy",
    title: "Multi-tenancy",
    description:
      "Scope notification state and delivery by tenant, organization, and workspace with framework-level isolation.",
  },
  security: {
    path: "/docs/security",
    title: "Security model",
    description:
      "Understand NotifyKit's trusted server APIs, client-safe routes, identity boundaries, and tenant isolation model.",
  },
  explain: {
    path: "/docs/explain",
    title: "Explain & dry run",
    description:
      "Preview exactly how NotifyKit would process a notification without writing records or triggering delivery.",
  },
  timeline: {
    path: "/docs/timeline",
    title: "Timeline",
    description:
      "Debug notification delivery with a chronological timeline from payload validation through final provider status.",
  },
  hooks: {
    path: "/docs/hooks",
    title: "Hooks & observability",
    description:
      "Connect NotifyKit lifecycle hooks to metrics, audit logs, error tracking, and operational alerts.",
  },
  api: {
    path: "/docs/api",
    title: "API reference",
    description:
      "Reference the complete createNotifyKit API for sending, state management, debugging, and delivery lifecycle operations.",
  },
  types: {
    path: "/docs/types",
    title: "TypeScript types",
    description:
      "Reference NotifyKit's exported TypeScript types, inferred payload utilities, results, and delivery status unions.",
  },
  "handler-routes": {
    path: "/docs/handler-routes",
    title: "Handler routes",
    description:
      "Reference the identity-scoped inbox, preferences, unsubscribe, notification, and realtime REST routes.",
  },
} as const;

export type DocsPageKey = keyof typeof DOCS_PAGES;

type PageMetadataInput = {
  title: string;
  description: string;
  path: string;
};

export function createPageMetadata({
  title,
  description,
  path,
}: PageMetadataInput): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      title: `${title} — ${SITE_NAME}`,
      description,
      url: path,
      siteName: SITE_NAME,
      locale: "en_US",
      type: "website",
      images: [
        {
          url: "/opengraph-image",
          width: 1200,
          height: 630,
          alt: SITE_TITLE,
          type: "image/png",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} — ${SITE_NAME}`,
      description,
      images: ["/opengraph-image"],
    },
  };
}

export function createDocsMetadata(key: DocsPageKey): Metadata {
  return createPageMetadata(DOCS_PAGES[key]);
}
