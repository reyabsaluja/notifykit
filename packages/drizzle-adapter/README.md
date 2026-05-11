# @notifykitjs/drizzle

Drizzle ORM database adapter for [NotifyKit](https://www.npmjs.com/package/@notifykitjs/core). Supports SQLite and Postgres.

## Install

```bash
npm install @notifykitjs/drizzle drizzle-orm
```

Requires [`@notifykitjs/core`](https://www.npmjs.com/package/@notifykitjs/core) as a peer dependency.

## Usage (SQLite)

```ts
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { createSqliteTables, drizzleSqliteAdapter } from "@notifykitjs/drizzle";

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
import { createPgTables, drizzlePostgresAdapter } from "@notifykitjs/drizzle";

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
import { notifyKitSchema } from "@notifykitjs/drizzle/schema/sqlite";
import { notifyKitPgSchema } from "@notifykitjs/drizzle/schema/postgres";
```

## Docs

Full documentation: [github.com/reyabsaluja/notifykit](https://github.com/reyabsaluja/notifykit)

## License

[MIT](https://github.com/reyabsaluja/notifykit/blob/main/LICENSE)
