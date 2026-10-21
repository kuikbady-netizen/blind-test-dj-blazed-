import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";
process.env.DATABASE_URL = "postgresql://blind_test_user:qw7ft65QMIvWLUU1aSXPgYeVZQ8fZWo3@dpg-dbcf98hkjs5s73a7beh0-a/blind_test;
const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool, { schema });

export * from "./schema";
