# Contributing to NotifyKit

Thanks for helping make NotifyKit more reliable. Bug reports, focused feature
proposals, documentation fixes, and tests are welcome.

## Before opening an issue

- Search the [existing issues](https://github.com/reyabsaluja/notifykit/issues).
- Include the package name and exact installed version.
- For bugs, provide a minimal reproduction and the expected versus actual
  behavior.
- For features, explain the concrete application problem before proposing an
  API. NotifyKit prioritizes its embedded, app-native model over matching every
  hosted-platform feature.

Please do not include API keys, recipient data, email addresses, or other
secrets in issues. Report security problems through [SECURITY.md](SECURITY.md).

## Local development

Requirements: Node.js 18 or newer and Bun.

```bash
git clone https://github.com/reyabsaluja/notifykit.git
cd notifykit
bun install --frozen-lockfile
bun run build
bun test
```

Before submitting a change, run:

```bash
bun run build
bun run typecheck
bun run typecheck:examples
bun test
bun run docs:build
```

Keep pull requests focused, add regression tests for behavior changes, and
update public documentation when an exported API changes.

