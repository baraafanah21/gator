import { defineConfig } from "drizzle-kit";
import { readConfig } from "./src/config.js";

const config = readConfig();

export default defineConfig({
  schema: "./src/lib/db/schema.ts",
  out: "./src/lib/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: config.dbUrl,
  },
});
