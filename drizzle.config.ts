import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./database/drizzle/schema.ts",
  out: "./database/migrations",
  dialect: "sqlite",
});
