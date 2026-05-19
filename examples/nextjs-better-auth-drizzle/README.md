# Next.js + Better Auth + Drizzle example

Full SaaS example combining NotifyKit with a real authentication system and persistent storage.

## Prerequisites

- **Bun** — This example uses `bun:sqlite` and must be run with Bun (not Node.js)

## Stack

- **Next.js 15** — App Router
- **Better Auth** — Email/password authentication
- **Drizzle + SQLite** — Persistent storage for both auth and notifications
- **NotifyKit** — Inbox, preferences, email delivery
- **Resend** — Email provider (optional, falls back to fake)

## Setup

```bash
# Copy env file
cp .env.example .env

# Install dependencies
bun install

# Create database tables
bun db:push

# Start dev server
bun dev
```

Open [http://localhost:3200](http://localhost:3200).

## What it demonstrates

### Authentication integration

- Better Auth handles signup/login with email + password
- NotifyKit route handler uses Better Auth session for `identify()`
- Recipients are synced automatically via `upsertRecipient`

### Persistent notifications

- Drizzle SQLite adapter stores all NotifyKit data
- Inbox items, preferences, and deliveries survive server restarts

### Full UI

- Bell icon with unread badge
- Inbox panel with mark-read, archive actions
- Settings page with preference toggles per notification type
- Required notifications can't be disabled

### Email delivery

Set `RESEND_API_KEY` to send real emails, or leave it blank to use the fake provider for development.

## File structure

```
src/
├── app/
│   ├── (auth)/          # Login + signup pages
│   │   ├── login/
│   │   └── signup/
│   ├── (app)/           # Authenticated pages
│   │   ├── layout.tsx   # Auth guard + NotifyKitProvider
│   │   ├── page.tsx     # Dashboard
│   │   └── settings/    # Preferences UI
│   ├── api/
│   │   ├── auth/        # Better Auth route handler
│   │   └── notifykit/   # NotifyKit route handler
│   └── components/      # Bell + Inbox components
├── db/                  # Drizzle setup + migration
└── lib/
    ├── auth.ts          # Better Auth server config
    ├── auth-client.ts   # Better Auth client hooks
    └── notify.ts        # NotifyKit instance
```
