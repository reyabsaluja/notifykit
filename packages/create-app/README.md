# create-notifykit-app

Scaffold a new [NotifyKit](https://www.npmjs.com/package/notifykit) project — Next.js app with inbox, email, preferences, and signed unsubscribe links pre-wired.

## Usage

```bash
npx create-notifykit-app my-app
cd my-app
cp .env.example .env.local
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# paste the generated value into .env.local as NOTIFYKIT_SECRET
npm install
npm run dev
```

The generated app includes:

- `lib/notifykit.ts` — notification definitions and engine setup
- `app/api/notifykit/[...route]/route.ts` — REST API handler
- `app/page.tsx` — inbox UI with send form
- `app/settings/notifications/page.tsx` — preferences table
- React hooks via `notifykit-react`

## Docs

Full documentation: [github.com/reyabsaluja/notifykit](https://github.com/reyabsaluja/notifykit)

## License

[MIT](https://github.com/reyabsaluja/notifykit/blob/main/LICENSE)
