"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Entry = { href: string; label: string };
type Group = { heading: string; entries: Entry[] };

const NAV: Group[] = [
  {
    heading: "Getting Started",
    entries: [
      { href: "/", label: "Overview" },
      { href: "/docs/installation", label: "Installation" },
      { href: "/docs/quickstart", label: "Quickstart" },
    ],
  },
  {
    heading: "Core Concepts",
    entries: [
      { href: "/docs/defining", label: "Defining notifications" },
      { href: "/docs/sending", label: "Sending" },
      { href: "/docs/channels", label: "Channels" },
      { href: "/docs/preferences", label: "Preferences & unsubscribe" },
      { href: "/docs/digests", label: "Digests & rate limits" },
      { href: "/docs/quiet-hours", label: "Quiet hours" },
      { href: "/docs/deduplication", label: "Dedup & idempotency" },
      { href: "/docs/fallbacks", label: "Fallback channels" },
    ],
  },
  {
    heading: "Framework Integration",
    entries: [
      { href: "/docs/nextjs", label: "Next.js" },
      { href: "/docs/react", label: "React hooks & components" },
      { href: "/docs/realtime", label: "Realtime" },
    ],
  },
  {
    heading: "Production",
    entries: [
      { href: "/docs/database", label: "Database adapters" },
      { href: "/docs/providers", label: "Email & webhook providers" },
      { href: "/docs/multi-tenancy", label: "Multi-tenancy" },
      { href: "/docs/security", label: "Security model" },
    ],
  },
  {
    heading: "Debugging",
    entries: [
      { href: "/docs/explain", label: "Explain & dry run" },
      { href: "/docs/timeline", label: "Timeline" },
      { href: "/docs/hooks", label: "Hooks & observability" },
    ],
  },
  {
    heading: "Reference",
    entries: [
      { href: "/docs/api", label: "API reference" },
      { href: "/docs/types", label: "TypeScript types" },
      { href: "/docs/handler-routes", label: "Handler routes" },
    ],
  },
  {
    heading: "Try it",
    entries: [{ href: "/demo", label: "Live demo" }],
  },
];

export function SideNav() {
  const pathname = usePathname();
  return (
    <nav className="docs-nav" aria-label="Docs">
      <Link href="/" className="docs-nav-logo">
        NotifyKit
      </Link>
      {NAV.map((group) => (
        <section key={group.heading}>
          <h4>{group.heading}</h4>
          <ul>
            {group.entries.map((entry) => (
              <li key={entry.href}>
                <Link
                  href={entry.href}
                  aria-current={pathname === entry.href ? "page" : undefined}
                >
                  {entry.label}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </nav>
  );
}
