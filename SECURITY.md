# Security policy

## Supported versions

NotifyKit is pre-1.0. Security fixes are applied to the latest published
version and the `main` branch. Upgrade to the newest release before reporting
an issue that may already be fixed.

## Reporting a vulnerability

Please do not publish exploit details in a public issue. Use GitHub's private
vulnerability reporting for this repository when available. If that option is
not enabled, open a minimal issue asking the maintainer for a private contact
channel without including sensitive details.

Include the affected package and version, impact, reproduction steps, and any
suggested mitigation. You should receive an acknowledgment within seven days.

## Scope

Reports involving authentication boundaries, tenant/workspace isolation,
unsubscribe-token integrity, webhook signature verification, SSRF prevention,
or sensitive data exposure are especially helpful. Denial-of-service reports
should include a practical attack path rather than theoretical unbounded input.
