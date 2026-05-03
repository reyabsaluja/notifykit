# notifykit-drizzle

Drizzle ORM database adapter for [NotifyKit](https://www.npmjs.com/package/notifykit). Supports SQLite and Postgres.

## Install

```bash
npm install notifykit-drizzle drizzle-orm
```

Requires [`notifykit`](https://www.npmjs.com/package/notifykit) as a peer dependency.

## Usage (SQLite)

```ts
import { drizzle } from "drizzle-orm/better-sqlite3";
import { createSqliteTables, drizzleSqliteAdapter } from "notifykit-drizzle";

const db = drizzle(new Database("app.db"));
await createSqliteTables(db);

const notify = createNotifyKit({
  // ...
  database: drizzleSqliteAdapter(db),
});
```

## Usage (Postgres)

```ts
import { drizzle } from "drizzle-orm/node-postgres";
import { createPgTables, drizzlePostgresAdapter } from "notifykit-drizzle";

const db = drizzle(pool);
await createPgTables(db);

const notify = createNotifyKit({
  // ...
  database: drizzlePostgresAdapter(db),
});
```

## Schema access

The exported schemas let you join NotifyKit tables against your own:

```ts
import { notifyKitSchema } from "notifykit-drizzle/schema/sqlite";
import { notifyKitPgSchema } from "notifykit-drizzle/schema/postgres";
```

## Docs

Full documentation: [github.com/reyabsaluja/notifykit](https://github.com/reyabsaluja/notifykit)

## License

[MIT](https://github.com/reyabsaluja/notifykit/blob/main/LICENSE)
