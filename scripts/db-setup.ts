import { readFile } from "node:fs/promises";
import { closeDb, db } from "../src/lib/db";

const schema = await readFile(new URL("../db/schema.sql", import.meta.url), "utf8");
await db().query(schema);
console.log("Schema is up to date.");
await closeDb();
