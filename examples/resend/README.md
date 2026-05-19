# Resend example

Sends real emails via [Resend](https://resend.com).

## Setup

1. Create an account at [resend.com](https://resend.com)
2. Generate an API key at [resend.com/api-keys](https://resend.com/api-keys)
3. Set the environment variable:

```bash
export RESEND_API_KEY="re_your_key_here"
```

## Run

```bash
bun start
```

By default emails are sent to `delivered@resend.dev` (Resend's test sink).
To receive real emails, set `TEST_EMAIL` to your verified address:

```bash
TEST_EMAIL="you@example.com" bun start
```

> **Note**: With a free Resend account you can only send to your own verified email.
> The `from` address uses `onboarding@resend.dev` which is pre-verified on all accounts.

## What it demonstrates

- `resendProvider()` configuration
- Multiple notification types (welcome + invoice)
- Lifecycle hooks for delivery tracking
- Real email delivery with provider message IDs
