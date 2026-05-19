import { resolve } from "path";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";

const sqlite = new Database(resolve(import.meta.dir, "../../local.db"));
export const db = drizzle(sqlite);
