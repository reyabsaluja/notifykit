"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Entry = { href: string; label: string };
type Group = { heading: string; entries: Entry[] };

const NAV: Group[] = [
  {
    heading: "Start here",
    entries: [
      { href: "/", label: "Overview" },
      { href: "/docs/installation", label: "Installation" },
    ],
  },
  {
    heading: "Guides",
    entries: [
      { href: "/docs/defining", label: "Defining notifications" },
      { href: "/docs/sending", label: "Sending" },
      { href: "/docs/preferences", label: "Preferences & unsubscribe" },
      { href: "/docs/providers", label: "Production providers" },
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
      <Link
        href="/"
        style={{
          fontWeight: 700,
          fontSize: "1.1rem",
          display: "inline-block",
          marginBottom: "0.5rem",
          color: "var(--fg)",
        }}
      >
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
