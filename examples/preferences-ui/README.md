# Preferences UI example

A Next.js 15 app showing a notification preferences panel with channel toggles, grouped by category.

## Run

```bash
bun install
bun dev
```

Open [http://localhost:3101](http://localhost:3101).

## What it demonstrates

- `usePreferences()` hook for fetching and updating channel preferences
- Category grouping (social, tasks, billing, security)
- Per-notification channel toggles (in-app, email, SMS)
- Required notifications that can't be disabled (billing, security)
- Toggle UI with locked state for required notifications
- Dark mode support
- API route handler via `createRouteHandler`
