import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";
import { readConfig } from "../../config.js";

const config = readConfig();

const conn = postgres(config.dbUrl);

export const db = drizzle(conn, { schema });
